# Spatial Studio

The web application opens into a multipage Studio with Overview, Projects, Capture, Import images, and Preferences routes. The shell keeps navigation and workspace status visible while each route presents one focused task.

## Local image projects

The import route accepts individual image files and directory selections through the browser file picker, as well as drag and drop. Supported formats include JPEG, PNG, WebP, AVIF, GIF, BMP, TIFF, HEIC, and HEIF. SVG is excluded. Imports are filtered by image MIME type or a known image extension, then stored as content-hashed artifacts in IndexedDB and referenced by a project record and initial revision. Source files are not uploaded.

Imported originals remain in browser storage. Browser quota and browser-specific directory-picker support can vary; storage failures are surfaced in the import flow. Project export and cross-device migration are separate capabilities and are not implied by local import.

## Appearance and motion

Preferences offers Obsidian, Glacier, and Moss palettes. The selected theme is stored in local browser preferences. Route transitions, project cards, the spatial overview illustration, and busy feedback use short, restrained motion. The interface honors `prefers-reduced-motion` by reducing animation and transition durations.
