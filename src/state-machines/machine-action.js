import { Machine } from "xstate";

// This machine is completely decoupled from Vue
export const actionMachine = Machine({
  id: "action",
  context: {
    /* some data */
  },
  initial: "initiating",
  states: {
    initiating: {
      on: {
        CANCEL: "canceled",
        APPROVAL_NOT_NEEDED: "eligible",
        REQUEST_APPROVAL: "to_approve"
      }
    },
    eligible: {
      on: {
        CANCEL: "canceled",
        FINISH: "done",
        APPROVAL_NEEDED: "initiating"
      }
    },
    to_approve: { on: { REJECT: "rejected", APPROVE: "approved" } },
    rejected: { on: { REQUEST_APPROVAL: "to_approve" } },
    approved: {
      on: {
        APPROVAL_NEEDED: "initiating",
        REQUEST_CANCELLATION: "cancellation_requested",
        FINISH: "done"
      }
    },
    cancellation_requested: {
      on: {
        APPROVE_CANCELLATION: "canceled",
        REJECT_CANCELLATION: "approved"
      }
    },
    canceled: { on: { REVIVE: "eligible" } },
    done: {
      on: { REVERT_FINISH: "eligible" }
    }
  }
});
