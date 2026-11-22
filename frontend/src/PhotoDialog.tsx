import { useEffect, useRef } from 'react'
import { photoDate } from './catalog'
import type { Photo } from './catalog'

interface PhotoDialogProps {
  photo: Photo
  onClose: () => void
  previous?: () => void
  next?: () => void
}

export function PhotoDialog({ photo, onClose, previous, next }: PhotoDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const trigger = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className="photo-dialog"
      aria-label="Photo preview"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' && previous) { event.preventDefault(); previous() }
        if (event.key === 'ArrowRight' && next) { event.preventDefault(); next() }
      }}
    >
      <div className="dialog-content">
        <div className="section-heading">
          <p className="muted">{photoDate(photo)}</p>
          <button className="button" onClick={onClose} autoFocus>Close</button>
        </div>
        <img src={photo.display_url} alt={photo.caption || 'Travel photo'} />
        {photo.caption && <p className="photo-caption">{photo.caption}</p>}
        {(previous || next) && (
          <div className="section-heading">
            <button className="button" onClick={previous} disabled={!previous}>Previous photo</button>
            <button className="button" onClick={next} disabled={!next}>Next photo</button>
          </div>
        )}
      </div>
    </dialog>
  )
}
