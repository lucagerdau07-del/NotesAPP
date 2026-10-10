export function screenToWorld(camera, point) {
  return {
    x: point.x / camera.scale + camera.x,
    y: point.y / camera.scale + camera.y,
  };
}

export function worldToScreen(camera, point) {
  return {
    x: (point.x - camera.x) * camera.scale,
    y: (point.y - camera.y) * camera.scale,
  };
}
