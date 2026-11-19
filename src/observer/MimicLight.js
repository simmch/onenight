// Preserve each switch edge so even a quick on/off test is copied in order.
export function createMimicLight(initial, delay) {
  const edges = [];
  let observed = initial, on = initial, time = 0, raised = initial ? 1 : 0;
  return {
    update(dt, playerLight) {
      time += dt;
      if (observed !== playerLight) {
        observed = playerLight;
        edges.push({ at: time + delay, on: playerLight });
      }
      let switched = false;
      while (edges.length && edges[0].at <= time) {
        on = edges.shift().on;
        switched = true;
      }
      raised += ((on ? 1 : 0) - raised) * (1 - Math.exp(-dt * 15));
      return { on, raised, switched };
    },
  };
}
