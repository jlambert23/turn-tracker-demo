/* UI only: all game-state changes come from the fetched Python module. */
const palette = [
  { name: "Blue", color: "#87c8e7" },
  { name: "Coral", color: "#e6a18c" },
  { name: "Mint", color: "#a7d9ae" },
  { name: "Gold", color: "#dfc681" },
  { name: "Lilac", color: "#c5adeb" },
];
const pucks = palette.slice(0, 3).map((item, index) => ({ id: `puck-${index + 1}`, ...item }));
const $ = (id) => document.getElementById(id);
let engine;
let state;

function readState() {
  return JSON.parse(engine.runPython(`json.dumps({
    "mode": state.mode,
    "order": state.order,
    "active_player": state.active_player,
    "blinking_players": state.blinking_players,
    "awaiting_end_confirmation": state.awaiting_end_confirmation
  })`));
}

function render() {
  const ready = Boolean(state);
  const first = state?.order[0];
  const confirming = state?.awaiting_end_confirmation;
  const labels = new Map(pucks.map((puck) => [puck.id, puck.name]));
  $("engine-status").textContent = ready ? "Python engine live · Pyodide" : "Loading Python engine…";
  $("mode-label").textContent = !ready ? "PLEASE WAIT" : confirming ? "END GAME?" : state.mode === "play" ? "PLAY MODE" : "SETUP MODE";
  $("mode-detail").textContent = !ready ? "Fetching Pyodide and turn_flow.py" : confirming
    ? `All registered pucks blink. Press ${labels.get(first)} again to confirm.`
    : state.mode === "play" ? `${labels.get(state.active_player)} has the turn.`
    : state.order.length ? `Hold ${labels.get(first)} to start when everyone is registered.`
    : "Tap each puck once in your chosen turn order.";
  $("instruction").textContent = !ready ? "Wait for the Python engine to load."
    : confirming ? `Press ${labels.get(first)} again (tap or hold) to reset to setup mode.`
    : state.mode === "play" ? "Only the active puck can pass. Hold the first puck to request an end."
    : "Tap pucks in any order; seating position does not matter.";
  $("add-puck").disabled = !ready || state.mode !== "setup";

  const track = $("order-track");
  track.replaceChildren();
  if (!state?.order.length) {
    const empty = document.createElement("span");
    empty.className = "order-empty";
    empty.textContent = "No players registered yet";
    track.append(empty);
  } else {
    state.order.forEach((id, index) => {
      if (index) {
        const arrow = document.createElement("span");
        arrow.className = "order-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        track.append(arrow);
      }
      const chip = document.createElement("span");
      chip.className = "order-chip";
      chip.textContent = `${String(index + 1).padStart(2, "0")}  ${labels.get(id)}`;
      track.append(chip);
    });
  }

  const grid = $("pucks");
  grid.replaceChildren();
  pucks.forEach((puck) => {
    const registered = state?.order.includes(puck.id);
    const active = state?.active_player === puck.id;
    const blinking = state?.blinking_players.includes(puck.id);
    const card = document.createElement("article");
    card.className = `puck${active ? " active" : ""}${blinking ? " blinking" : ""}`;
    card.dataset.puck = puck.id;
    card.style.setProperty("--color", puck.color);
    card.style.setProperty("--glow", `${puck.color}44`);
    const top = document.createElement("div");
    top.className = "puck-top";
    const id = document.createElement("span");
    id.className = "puck-id";
    id.textContent = `PUCK ${String(pucks.indexOf(puck) + 1).padStart(2, "0")}`;
    const status = document.createElement("span");
    status.className = "puck-state";
    status.textContent = blinking ? "● BLINKING" : active ? "● YOUR TURN" : registered ? "● IN ORDER" : "○ WAITING";
    top.append(id, status);
    const indicator = document.createElement("div");
    indicator.className = "puck-indicator";
    indicator.setAttribute("aria-hidden", "true");
    const name = document.createElement("h3");
    name.className = "puck-name";
    name.textContent = puck.name;
    const controls = document.createElement("div");
    controls.className = "puck-controls";
    for (const gesture of ["tap", "hold"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = gesture === "tap" ? "Tap" : "Hold";
      button.setAttribute("aria-label", `${gesture} ${puck.name} puck`);
      button.dataset.gesture = gesture;
      button.disabled = !ready;
      button.addEventListener("click", () => press(puck, gesture));
      controls.append(button);
    }
    card.append(top, indicator, name, controls);
    grid.append(card);
  });
}

function press(puck, gesture) {
  const previous = state;
  const before = JSON.stringify(previous);
  engine.globals.set("event_player", puck.id);
  engine.globals.set("event_gesture", gesture);
  try {
    engine.runPython("state = step(state, event_player, event_gesture)");
    state = readState();
    render();
    const item = document.createElement("li");
    const ignored = before === JSON.stringify(state);
    item.className = ignored ? "ignored" : "";
    let outcome = "state updated";
    if (ignored) outcome = "no change";
    else if (state.awaiting_end_confirmation) outcome = "end requested";
    else if (previous.mode === "play" && state.mode === "setup") outcome = "game ended";
    else if (previous.mode === "setup" && state.mode === "play") outcome = "play started";
    else if (state.mode === "play") outcome = `passed to ${pucks.find((entry) => entry.id === state.active_player).name}`;
    else if (state.order.length > previous.order.length) outcome = `joined as #${state.order.length}`;
    item.textContent = `${puck.name} · ${gesture.toUpperCase()} — ${outcome}`;
    const log = $("event-log");
    log.querySelector(".log-empty")?.remove();
    log.prepend(item);
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  console.error("Python engine error:", error);
  state = null;
  render();
  $("engine-status").textContent = "Python engine unavailable";
  $("mode-label").textContent = "LOAD FAILED";
  $("mode-detail").textContent = "Could not load Pyodide or turn_flow.py. Check the network and reload.";
  $("instruction").textContent = String(error);
}

$("add-puck").addEventListener("click", () => {
  const index = pucks.length;
  const color = palette[index % palette.length].color;
  pucks.push({ id: `puck-${index + 1}`, name: index < palette.length ? palette[index].name : `Player ${index + 1}`, color });
  render();
});

async function start() {
  render();
  try {
    if (typeof loadPyodide !== "function") throw new Error("Pyodide script did not load");
    const response = await fetch("../turn_flow.py");
    if (!response.ok) throw new Error(`turn_flow.py: HTTP ${response.status}`);
    const source = await response.text();
    engine = await loadPyodide();
    engine.FS.writeFile("turn_flow.py", source);
    engine.runPython("import json\nfrom turn_flow import State, step\nstate = State()");
    state = readState();
    render();
  } catch (error) {
    showError(error);
  }
}

start();
