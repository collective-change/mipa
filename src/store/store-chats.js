import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { Notify } from "quasar";
import { showErrorMessage } from "src/utils/util-show-error-message";

const state = {
  currentChat: null
};

const mutations = {};

const actions = {
  async addChat({ dispatch }, payload) {
    let chat = {
      orgId: payload.orgId,
      members: payload.members,
      membersOnly: payload.membersOnly ? true : false,
      subjectDocType: payload.subjectDocType,
      subjectDocLineage: payload.subjectDocLineage,
      subjectDocTitle: payload.subjectDocTitle,
      newestMessages: []
    };

    let newChatRef = await firebaseDb.collection("chats").add(chat);

    //add chatId to the subject doc
    switch (payload.subjectDocType) {
      case "action":
        dispatch(
          "actions/updateAction",
          {
            id: payload.subjectDocLineage.actionId,
            updates: { chatId: newChatRef.id }
          },
          { root: true }
        );
        break;
      case "node":
        dispatch(
          "model/updateNode",
          {
            modelId: payload.subjectDocLineage.modelId,
            updates: {
              id: payload.subjectDocLineage.nodeId,
              chatId: newChatRef.id
            },
            successNotice: "Chat added to node"
          },
          { root: true }
        );
        break;
    }

    return newChatRef.id;
  },

  addMessage({ dispatch }, payload) {
    //TODO: if newestMessages is too large, then move old messages to log

    firebaseDb
      .collection("chats")
      .doc(payload.chatId)
      .update({
        newestMessages: firebase.firestore.FieldValue.arrayUnion(
          payload.message
        )
      });
    //TODO: increment count in chat.members[userId].unreadCount
    //TODO: notify chat members by adding message to user's unreadMessages subcollection
    //and/or pushing notification to user's device
  },

  bindCurrentChat: firestoreAction(({ bindFirestoreRef }, chatId) => {
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "currentChat",
      firebaseDb.collection("chats").doc(chatId),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindCurrentChat: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("currentChat", true);
  })
};

const getters = {};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
