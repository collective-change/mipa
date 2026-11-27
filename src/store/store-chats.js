import { defineStore } from "pinia";
import { firebaseDb, firebaseAuth } from "@/boot/firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteField,
  serverTimestamp
} from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { Notify } from "quasar";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { i18n } from "@/boot/i18n";

export const useChatsStore = defineStore("chats", {
  state: () => ({
    currentChat: null,
    unreadChats: null
  }),

  getters: {
    sortedUnreadChats: (state) => {
      if (state.unreadChats) {
        const tempChats = [...state.unreadChats];
        return tempChats.sort((a, b) => b.updateTime - a.updateTime);
      }
      return null;
    }
  },

  actions: {
    async fsAddChat(payload) {
      const chat = {
        orgId: payload.orgId,
        orgNameCached: payload.orgName,
        orgNameSlugCached: payload.orgNameSlug,
        members: payload.members,
        membersOnly: Boolean(payload.membersOnly),
        subjectDocType: payload.subjectDocType,
        subjectDocLineage: payload.subjectDocLineage,
        subjectDocTitle: payload.subjectDocTitle,
        newestMessages: []
      };

      const newChatRef = await addDoc(collection(firebaseDb, "chats"), chat);

      switch (payload.subjectDocType) {
        case "action": {
          const actionsMod = await import("./store-actions");
          if (actionsMod.useActionsStore) {
            actionsMod.useActionsStore(this.$pinia).updateAction({
              id: payload.subjectDocLineage.actionId,
              updates: { chatId: newChatRef.id }
            });
          }
          break;
        }
        case "node": {
          const modelMod = await import("./store-model");
          if (modelMod.useModelStore) {
            modelMod.useModelStore(this.$pinia).updateNode({
              modelId: payload.subjectDocLineage.modelId,
              updates: {
                id: payload.subjectDocLineage.nodeId,
                chatId: newChatRef.id
              },
              successNotice: "Chat added to node"
            });
          }
          break;
        }
      }

      return newChatRef.id;
    },

    fsAddChatMember(payload) {
      return updateDoc(doc(firebaseDb, "chats", payload.chatId), {
        members: arrayUnion(payload.memberId),
        [`unreadCounts.${payload.memberId}`]: 0,
        [`unreadBy.${payload.memberId}`]: false
      })
        .then(function () {
          Notify.create(i18n.global.t("toastChatMemberAdded"));
        })
        .catch(function (error) {
          showErrorMessage("Error adding chat member", error.message);
        });
    },

    fsRemoveChatMember(payload) {
      return updateDoc(doc(firebaseDb, "chats", payload.chatId), {
        members: arrayRemove(payload.memberId),
        [`unreadCounts.${payload.memberId}`]: deleteField(),
        [`unreadBy.${payload.memberId}`]: deleteField()
      })
        .then(function () {
          Notify.create(i18n.global.t("toastChatMemberRemoved"));
        })
        .catch(function (error) {
          showErrorMessage("Error removing chat member", error.message);
        });
    },

    fsAddMessage(payload) {
      let unreadCounts = {};
      let unreadBy = {};
      if (this.currentChat) {
        unreadCounts = this.currentChat.unreadCounts
          ? Object.assign({}, this.currentChat.unreadCounts)
          : {};
        unreadBy = this.currentChat.unreadBy
          ? Object.assign({}, this.currentChat.unreadBy)
          : {};
        this.currentChat.members.forEach((memberId) => {
          if (memberId != firebaseAuth.currentUser.uid) {
            unreadBy[memberId] = true;
            if (Object.prototype.hasOwnProperty.call(unreadCounts, memberId)) {
              unreadCounts[memberId]++;
            } else {
              unreadCounts[memberId] = 1;
            }
          }
        });
      }
      return updateDoc(doc(firebaseDb, "chats", payload.chatId), {
        members: arrayUnion(firebaseAuth.currentUser.uid),
        newestMessages: arrayUnion(payload.message),
        unreadCounts,
        unreadBy,
        updateTime: serverTimestamp()
      });
    },

    fsResetReadCount(payload) {
      return updateDoc(doc(firebaseDb, "chats", payload.chatId), {
        [`unreadCounts.${payload.userId}`]: 0,
        [`unreadBy.${payload.userId}`]: false
      });
    },

    bindUnreadChats: firestoreAction(({ bindFirestoreRef }, userId) => {
      return bindFirestoreRef(
        "unreadChats",
        query(
          collection(firebaseDb, "chats"),
          where("members", "array-contains", userId),
          where(`unreadBy.${userId}`, "==", true)
        ),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindUnreadChats: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("unreadChats", true);
    }),

    bindCurrentChat: firestoreAction(({ bindFirestoreRef }, chatId) => {
      return bindFirestoreRef(
        "currentChat",
        doc(firebaseDb, "chats", chatId),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindCurrentChat: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("currentChat", true);
    })
  }
});

export default useChatsStore;
