/**
 * The grab-and-drag rotation convention, shared by every surface in the product
 * that can be spun: the marketing room scan, the identity object, and anything
 * added later. It lives here rather than beside either renderer so that no
 * surface can quietly invent its own signs — the one failure mode worth
 * preventing is a vertical axis that reads inverted in one place and correct in
 * another.
 */

/** One full revolution. Both axes accumulate past it without bound. */
export const FULL_TURN = Math.PI * 2;

export const YAW_DRAG_SENSITIVITY = 0.008;
export const PITCH_DRAG_SENSITIVITY = 0.0035;

/**
 * Accumulate a grab-and-drag delta into a rotation pose.
 *
 * BOTH axes are unbounded, accumulated rotations: keep dragging and yaw / pitch
 * keep winding past a full revolution (360°, 450°, ...) in either direction.
 * This is not a bounded camera "look-at" elevation — `pitch` here is a real
 * rotation of the object about its horizontal axis (the projector rotates the
 * world (Y, Z) plane by cos/sin pitch), so it is periodic and continuous: every
 * 2π returns to the same orientation with no jump and no information loss past
 * 90°/180°. (A previous build clamped pitch to a small range, which made a full
 * vertical revolution impossible — the model just froze at the elevation limit.)
 *
 * Screen space has +Y pointing down, so a downward drag is `deltaY > 0`. A
 * larger `pitch` rotates the scene so its front face tips downward, i.e. the
 * object rotates "up" as the pointer rises. So drag up (deltaY < 0) increases
 * pitch: `pitch - deltaY`. Yaw uses `+ deltaX` (drag right rotates right).
 *
 * Rotation is only ever produced by a drag while the pointer is down. Moving the
 * cursor over an object without holding a button must not rotate it.
 */
export function applyDragDelta(
  yaw: number,
  pitch: number,
  deltaX: number,
  deltaY: number,
): { yaw: number; pitch: number } {
  return {
    yaw: yaw + deltaX * YAW_DRAG_SENSITIVITY,
    pitch: pitch - deltaY * PITCH_DRAG_SENSITIVITY,
  };
}

/** Radians to degrees, for surfaces whose rotation is applied by CSS. */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
