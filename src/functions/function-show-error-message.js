import { Dialog, Loading } from "quasar";

export function showErrorMessage(errorTitle, errorMessage) {
  Loading.hide();
  Dialog.create({
    title: errorTitle,
    message: errorMessage
  });
}
