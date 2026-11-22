import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from .sources import PHOTO_EXTENSIONS, SourceImage, contained_file, coordinates, unix_timestamp


SIDECAR_NAME = re.compile(r"(?P<image>.+?)\.supplemental-[^.()]+(?P<copy>\(\d+\))?\.json$", re.I)


@dataclass
class Sidecar:
    path: Path
    metadata: dict


def sidecar_filename(path):
    match = SIDECAR_NAME.fullmatch(path.name)
    if match is None:
        image = Path(path.stem)
        copy_match = re.fullmatch(r"(.+\.[A-Za-z]+)(\(\d+\))", image.name)
        if not copy_match:
            return image.name.casefold()
        return f"{Path(copy_match[1]).stem}{copy_match[2]}{Path(copy_match[1]).suffix}".casefold()
    image = Path(match["image"])
    return f"{image.stem}{match['copy'] or ''}{image.suffix}".casefold()


def album_path(path, root):
    parts = path.parent.relative_to(root).parts
    for index, name in enumerate(parts):
        if name.casefold() == "google photos":
            return tuple(part.casefold() for part in parts[index + 1 :])
    return tuple(part.casefold() for part in parts)


def sidecar_index(paths, root):
    filenames = defaultdict(list)
    titles = defaultdict(list)
    for path in paths:
        resolved = contained_file(root, path)
        if resolved is None:
            continue
        try:
            with resolved.open("r", encoding="utf-8-sig") as file:
                text = file.read(2 * 1024 * 1024 + 1)
            if len(text) > 2 * 1024 * 1024:
                continue
            metadata = json.loads(text)
        except (OSError, ValueError):
            continue
        if not isinstance(metadata, dict) or not isinstance(metadata.get("title"), str):
            continue
        if not {"photoTakenTime", "geoData", "geoDataExif"}.intersection(metadata):
            continue
        sidecar = Sidecar(path, metadata)
        filenames[sidecar_filename(path)].append(sidecar)
        titles[metadata["title"].casefold()].append(sidecar)
    return filenames, titles


def matching_sidecar(path, root, photo_counts, filenames, titles):
    name = path.name.casefold()
    exact = filenames[name]
    titled = titles[name]
    album = album_path(path, root)
    groups = [
        [entry for entry in exact if entry.path.parent == path.parent],
        [entry for entry in titled if entry.path.parent == path.parent],
        [entry for entry in exact if album_path(entry.path, root) == album],
        [entry for entry in titled if album_path(entry.path, root) == album],
    ]
    if photo_counts[name] == 1:
        groups.extend((exact, titled))
    for matches in groups:
        if len(matches) == 1:
            return matches[0].metadata, ""
        if len(matches) > 1:
            break
    if exact or titled:
        return {}, "Multiple Takeout files match this name. Check the photo metadata."
    return {}, ""


def takeout_coordinates(metadata):
    for name in ("geoData", "geoDataExif"):
        raw = metadata.get(name)
        if isinstance(raw, dict):
            latitude, longitude = coordinates(raw.get("latitude"), raw.get("longitude"))
            if latitude is not None and (latitude != 0 or longitude != 0):
                return latitude, longitude
    return None, None


def takeout_items(root):
    photos = []
    sidecars = []
    for path in root.rglob("*"):
        if path.suffix.lower() in PHOTO_EXTENSIONS:
            photos.append(path)
        elif path.suffix.lower() == ".json":
            sidecars.append(path)
    photo_counts = Counter(path.name.casefold() for path in photos)
    filenames, titles = sidecar_index(sidecars, root)
    for path in photos:
        resolved = contained_file(root, path)
        if resolved is None:
            yield SourceImage(path.name, issue="File is unavailable in the source folder.")
            continue
        metadata, issue = matching_sidecar(path, root, photo_counts, filenames, titles)
        taken = metadata.get("photoTakenTime")
        timestamp = taken.get("timestamp") if isinstance(taken, dict) else None
        captured_at = unix_timestamp(timestamp)
        latitude, longitude = takeout_coordinates(metadata)
        yield SourceImage(
            name=path.name,
            open_file=lambda path=resolved: path.open("rb"),
            captured_on=captured_at.date() if captured_at else None,
            captured_at=captured_at,
            capture_text=str(timestamp) if captured_at else "",
            latitude=latitude,
            longitude=longitude,
            issue=issue,
        )
