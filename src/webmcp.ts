// Optional browser integration; the simulator never depends on this API.
type API = {
  reset: () => void;
  approach: () => string;
  pause: () => void;
  readonly state: unknown;
};
type Context = { registerTool: (tool: unknown) => void | Promise<void> };
export async function registerTools(api: API) {
  const context =
    (document as unknown as { modelContext?: Context }).modelContext ??
    (navigator as unknown as { modelContext?: Context }).modelContext;
  if (!context?.registerTool) return;
  for (const [name, description, action, readOnly] of [
    [
      "robotc_status",
      "Read robot pose, people, current path, and visit history.",
      () => api.state,
      true,
    ],
    [
      "robotc_approach",
      "Begin continuously approaching simulated people one by one.",
      () => {
        api.approach();
        return api.state;
      },
      false,
    ],
    [
      "robotc_pause",
      "Pause the simulation and release driving keys.",
      () => {
        api.pause();
        return api.state;
      },
      false,
    ],
    [
      "robotc_reset",
      "Reset the robot, assign people random activities and starting positions, and clear visit history.",
      () => {
        api.reset();
        return api.state;
      },
      false,
    ],
  ] as [string, string, () => unknown, boolean][]) {
    await context.registerTool({
      name,
      description,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: readOnly },
      execute: async () => ({
        content: [{ type: "text", text: JSON.stringify(action()) }],
      }),
    });
  }
}
