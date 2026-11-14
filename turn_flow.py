"""Pure, hardware-free turn-flow state transitions."""

from dataclasses import dataclass, replace


@dataclass(frozen=True)
class State:
    mode: str = "setup"
    order: tuple[str, ...] = ()
    active_index: int | None = None
    awaiting_end_confirmation: bool = False

    @property
    def active_player(self) -> str | None:
        if self.mode == "play":
            return self.order[self.active_index]
        return None

    @property
    def blinking_players(self) -> tuple[str, ...]:
        return self.order if self.awaiting_end_confirmation else ()


def step(state: State, player: str, gesture: str) -> State:
    if gesture not in ("tap", "hold"):
        raise ValueError(f"unknown gesture: {gesture}")
    if state.mode == "setup":
        if gesture == "tap" and player not in state.order:
            return replace(state, order=state.order + (player,))
        if gesture == "hold" and state.order and player == state.order[0]:
            return replace(state, mode="play", active_index=0)
    if state.mode == "play" and state.awaiting_end_confirmation:
        return State() if player == state.order[0] else state
    if state.mode == "play" and gesture == "hold" and state.order[0] == player:
        return replace(state, awaiting_end_confirmation=True)
    if state.mode == "play" and gesture == "tap" and player == state.active_player:
        return replace(state, active_index=(state.active_index + 1) % len(state.order))
    return state


if __name__ == "__main__":
    state = State()
    for player, gesture in (
        ("blue", "tap"), ("red", "tap"), ("green", "tap"),
        ("blue", "hold"), ("blue", "tap"),
        ("blue", "hold"), ("blue", "tap"),
    ):
        state = step(state, player, gesture)
        order = ",".join(state.order) or "-"
        active = state.active_player or "-"
        blinking = ",".join(state.blinking_players) or "-"
        print(f"{player} {gesture} -> {state.mode} order={order} active={active} blinking={blinking}")
