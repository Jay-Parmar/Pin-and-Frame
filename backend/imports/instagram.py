import json
import re
from datetime import datetime
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from .sources import (
    PHOTO_EXTENSIONS,
    SourceError,
    SourceImage,
    contained_file,
    coordinates,
    member_path,
    unix_timestamp,
)


MANIFEST_NAME = re.compile(r"posts(?:_\d+)?\.json", re.I)
MAX_MANIFEST_BYTES = 32 * 1024 * 1024


def manifest_root(path):
    if not MANIFEST_NAME.fullmatch(path.name):
        return None
    parts = path.parent.parts
    if parts[-2:] in {("your_instagram_activity", "media"), ("your_instagram_activity", "content")}:
        return PurePosixPath(*parts[:-2])
    if parts[-1:] == ("content",):
        return PurePosixPath(*parts[:-1])
    return path.parent if not parts else None


def photo_metadata(media):
    metadata = media.get("media_metadata")
    photo = metadata.get("photo_metadata") if isinstance(metadata, dict) else None
    rows = photo.get("exif_data") if isinstance(photo, dict) else None
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        return "", None, None

    capture_text = ""
    latitude = longitude = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        timestamp = row.get("date_time_original")
        if not capture_text and isinstance(timestamp, str):
            capture_text = timestamp
        if latitude is None:
            latitude, longitude = coordinates(row.get("latitude"), row.get("longitude"))
    return capture_text, latitude, longitude


def original_timestamp(timestamp):
    if not timestamp:
        return None
    timestamp = timestamp[:10].replace(":", "-") + timestamp[10:]
    try:
        return datetime.fromisoformat(timestamp)
    except ValueError:
        return None


def media_items(post, root, lookup):
    if not isinstance(post, dict) or not isinstance(post.get("media"), list):
        return
    for media in post["media"]:
        if not isinstance(media, dict):
            yield SourceImage("Instagram media", issue="The media entry is malformed.")
            continue
        path = member_path(media.get("uri"))
        if path is None:
            yield SourceImage("Instagram media", issue="The media path is invalid.")
            continue

        published_at = unix_timestamp(media.get("creation_timestamp")) or unix_timestamp(
            post.get("creation_timestamp")
        )
        if path.suffix.lower() not in PHOTO_EXTENSIONS:
            yield SourceImage(
                path.name,
                published_at=published_at,
                issue="Instagram entry is not a supported photo.",
                skipped=True,
            )
            continue
        open_file = lookup(root / path)
        if open_file is None and root.parts:
            open_file = lookup(path)
        timestamp, latitude, longitude = photo_metadata(media)
        captured = original_timestamp(timestamp)
        caption = media.get("title") or post.get("title")
        yield SourceImage(
            name=path.name,
            open_file=open_file,
            caption=caption if isinstance(caption, str) else "",
            captured_on=captured.date() if captured else None,
            captured_at=captured if captured and captured.tzinfo is not None else None,
            capture_text=timestamp,
            published_at=published_at,
            latitude=latitude,
            longitude=longitude,
            issue="" if open_file is not None else "Instagram photo is missing from the export.",
        )


def manifest_items(paths, lookup):
    manifests = [(path, manifest_root(path)) for path in paths]
    manifests = [(path, root) for path, root in manifests if root is not None]
    if not manifests:
        raise SourceError("No Instagram posts JSON was found in the export.")

    for path, root in sorted(manifests):
        try:
            open_file = lookup(path)
            if open_file is None:
                raise SourceError("The posts JSON file is unavailable.")
            with open_file() as file:
                content = file.read(MAX_MANIFEST_BYTES + 1)
            if len(content) > MAX_MANIFEST_BYTES:
                raise SourceError("The posts JSON file exceeds the 32 MB limit.")
            payload = json.loads(content.decode("utf-8-sig"))
            if isinstance(payload, dict):
                payload = payload.get("posts", payload.get("ig_posts"))
            if not isinstance(payload, list):
                raise SourceError("The posts JSON file has an unsupported format.")
        except SourceError as error:
            yield SourceImage(path.name, issue=str(error))
            continue
        except (OSError, ValueError, BadZipFile, NotImplementedError):
            yield SourceImage(path.name, issue="The posts JSON file could not be read.")
            continue

        for post in payload:
            yield from media_items(post, root, lookup)


def instagram_items(source):
    if source.is_dir():
        paths = (
            PurePosixPath(*path.relative_to(source).parts)
            for path in source.rglob("posts*.json")
        )

        def lookup(path):
            resolved = contained_file(source, source.joinpath(*path.parts))
            return (lambda: resolved.open("rb")) if resolved else None

        yield from manifest_items(paths, lookup)
        return

    try:
        with ZipFile(source) as archive:
            members = {}
            for info in archive.infolist():
                path = member_path(info.filename)
                if path and not info.is_dir() and not info.flag_bits & 1:
                    members[path] = None if path in members else info

            def lookup(path):
                info = members.get(path)
                return (lambda: archive.open(info)) if info else None

            yield from manifest_items(members, lookup)
    except (OSError, BadZipFile):
        raise SourceError("Instagram ZIP could not be read.") from None
