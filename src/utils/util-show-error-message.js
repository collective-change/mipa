import { Dialog, Loading } from "quasar";

export function showErrorMessage(errorTitle, errorMessage, useHtml = false) {
  Loading.hide();
  Dialog.create({
    title: errorTitle,
    message: errorMessage,
    html: useHtml
  });
}
