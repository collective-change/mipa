import { Machine } from "xstate";

// This machine is completely decoupled from Vue
export const actionMachine = Machine({
  id: "action",
  context: {
    /* some data */
  },
  initial: "eligible",
  states: {
    eligible: {
      on: { FINISH: "done" }
    },
    done: {
      on: { REVERT_FINISH: "eligible" }
    }
  }
});
