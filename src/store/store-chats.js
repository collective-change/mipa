import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { Notify } from "quasar";
import { showErrorMessage } from "src/utils/util-show-error-message";

const state = {
  currentChat: null,
  unreadChats: null
};

const mutations = {};

const actions = {
  async fsAddChat({ dispatch }, payload) {
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

  fsAddChatMember({ dispatch }, payload) {
    firebaseDb
      .collection("chats")
      .doc(payload.chatId)
      .update({
        members: firebase.firestore.FieldValue.arrayUnion(payload.memberId),
        [`unreadCounts.${payload.memberId}`]: 0,
        [`unreadBy.${payload.memberId}`]: false
      })
      .then(function() {
        Notify.create("Member added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding member", error.message);
      });
  },

  fsRemoveChatMember({ dispatch }, payload) {
    firebaseDb
      .collection("chats")
      .doc(payload.chatId)
      .update({
        members: firebase.firestore.FieldValue.arrayRemove(payload.memberId),
        [`unreadCounts.${payload.memberId}`]: firebase.firestore.FieldValue.delete(),
        [`unreadBy.${payload.memberId}`]: firebase.firestore.FieldValue.delete()
      })
      .then(function() {
        Notify.create("Member removed!");
      })
      .catch(function(error) {
        showErrorMessage("Error removing member", error.message);
      });
  },

  fsAddMessage({ dispatch }, payload) {
    //TODO: if newestMessages is too large, then move old messages to log

    let unreadCounts;
    let unreadBy;
    if (state.currentChat) {
      if (state.currentChat.unreadCounts)
        unreadCounts = Object.assign({}, state.currentChat.unreadCounts);
      else unreadCounts = {};
      if (state.currentChat.unreadBy)
        unreadBy = Object.assign({}, state.currentChat.unreadBy);
      else unreadBy = {};
      state.currentChat.members.forEach(memberId => {
        if (memberId != firebaseAuth.currentUser.uid) {
          unreadBy[memberId] = true;
          if (unreadCounts.hasOwnProperty(memberId)) unreadCounts[memberId]++;
          else unreadCounts[memberId] = 1;
        }
      });
    } else unreadCounts = {};
    firebaseDb
      .collection("chats")
      .doc(payload.chatId)
      .update({
        newestMessages: firebase.firestore.FieldValue.arrayUnion(
          payload.message
        ),
        unreadCounts,
        unreadBy,
        updateTime: firebase.firestore.FieldValue.serverTimestamp()
      });
  },

  fsResetReadCount({}, payload) {
    firebaseDb
      .collection("chats")
      .doc(payload.chatId)
      .update({
        [`unreadCounts.${payload.userId}`]: 0,
        [`unreadBy.${payload.userId}`]: false
      });
  },

  bindUnreadChats: firestoreAction(({ bindFirestoreRef }, userId) => {
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "unreadChats",
      //firebaseDb.collection("chats").where("members", "array-contains", userId),
      firebaseDb
        .collection("chats")
        .where("members", "array-contains", userId)
        .where(`unreadBy.${userId}`, "==", true),
      {
        maxRefDepth: 1,
        wait: true //this also forces reset: false
      }
    );
  }),

  unbindUnreadChats: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("unreadChats", true);
  }),

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
