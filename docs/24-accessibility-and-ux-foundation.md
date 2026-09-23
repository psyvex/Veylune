# 24. Accessibility and UX Foundation

## Principle

Production quality includes predictable interaction, clear recovery and accessibility. Technical complexity belongs behind progressive disclosure.

## Interaction states

Every long-running operation must expose:

- idle
- queued
- running
- paused where supported
- cancelling
- completed
- failed
- recoverable

The UI must never make the user guess whether work is still running.

## Progressive disclosure

Advanced reconstruction, model and performance controls should remain available without forcing technical terminology into the primary workflow.

Users should see meaningful concepts first:

- quality
- speed
- privacy
- estimated resource use
- confidence

## Accessibility baseline

The application should target WCAG 2.2 AA for applicable UI surfaces, including:

- keyboard operation
- visible focus
- sufficient non-color cues
- semantic labels
- accessible names for controls
- reduced-motion support
- logical heading/navigation structure
- meaningful status announcements
- error identification and recovery guidance

## Responsive behavior

The editor must support constrained viewport sizes. Critical project operations must remain reachable without relying on hover or precision pointer input.

## Destructive actions

Deletion of source photos, projects or generated assets must clearly identify scope and consequences. Destructive operations should provide recovery where technically possible.

## Performance UX

If a device cannot support requested quality, the application should explain the trade-off and offer a lower resource mode rather than presenting a generic failure.

## Privacy UX

The first-run flow should clearly communicate local processing and any operation that would require network access. Network-dependent features must be distinguishable from the local workflow.
