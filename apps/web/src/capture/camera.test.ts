import { describe, expect, it } from "vitest";
import { describeCameraError } from "./camera";

const error = (name: string): DOMException => new DOMException("underlying", name);

describe("describeCameraError", () => {
  it("maps permission denials to the site-settings fix", () => {
    expect(describeCameraError(error("NotAllowedError"))).toContain("permission was denied");
    expect(describeCameraError(error("PermissionDeniedError"))).toContain("permission was denied");
  });

  it("maps missing devices and busy cameras", () => {
    expect(describeCameraError(error("NotFoundError"))).toContain("No camera found");
    expect(describeCameraError(error("DevicesNotFoundError"))).toContain("No camera found");
    expect(describeCameraError(error("NotReadableError"))).toContain("in use by another app");
    expect(describeCameraError(error("TrackStartError"))).toContain("in use by another app");
  });

  it("maps constraint failures and the insecure-context security error", () => {
    expect(describeCameraError(error("OverconstrainedError"))).toContain("requested video settings");
    expect(describeCameraError(error("SecurityError"))).toContain("HTTPS");
  });

  it("falls back to generic copy for unknown errors and non-errors", () => {
    expect(describeCameraError(error("SomethingNewError"))).toContain("Unable to start the camera");
    expect(describeCameraError(new Error("anonymous"))).toContain("Unable to start the camera");
    expect(describeCameraError("not even an error")).toContain("Unable to start the camera");
    expect(describeCameraError(undefined)).toContain("Unable to start the camera");
  });
});
