<template>
  <div
    class="component-chat flex column"
    style="border-style: solid; border-color: #bbb; border-width: 1px"
  >
    <q-toolbar class="q-pa-none bg-grey-3">
      <chat-members
        :chatId="chatId"
        :subjectDocType="subjectDocType"
        :subjectDocLineage="subjectDocLineage"
        :subjectDocTitle="subjectDocTitle"
      />
      <q-space />
      <q-btn flat round dense>
        <q-icon name="visibility" color="grey-8" />
        <q-tooltip
          >Visible to everyone in your organization. Press to allow chat members
          only. (Not working yet)</q-tooltip
        >
      </q-btn>
      <q-btn flat round dense>
        <q-icon name="notifications_off" color="grey-8" />
        <q-tooltip
          >You are not notified of new messages. Press to enable. (Not working
          yet)</q-tooltip
        >
      </q-btn>
    </q-toolbar>

    <div
      :class="{ invisible: !showMessages }"
      class="column col justify-end"
      style="min-height: 300px; max-height: 300px"
    >
      <div
        v-if="currentChat"
        ref="chatComponent"
        style="overflow-x: hidden; overflow-y: auto"
      >
        <q-chat-message
          v-for="(message, key) in messagesForDisplay"
          :key="key"
          :name="
            message.from == currentUser.id
              ? ''
              : getUserDisplayNameOrTruncatedEmail(message.from)
          "
          :avatar="
            message.from == currentUser.id
              ? undefined
              : getUserPhotoURL(message.from)
              ? getUserPhotoURL(message.from)
              : undefined
          "
          :text="[message.text]"
          :sent="message.from == currentUser.id ? true : false"
          :stamp="formatFirestoreTimestamp(message.timestamp)"
          :bg-color="
            message.from == currentUser.id ? 'light-green-2' : 'grey-4'
          "
          name-sanitize
          text-sanitize
          class="q-px-md"
        />
      </div>
    </div>
    <q-toolbar class="bg-primary">
      <q-form class="full-width">
        <q-input
          v-model="newMessage"
          ref="newMessage"
          bg-color="white"
          rounded
          outlined
          placeholder="Message"
          dense
        >
          <template v-slot:after>
            <q-btn
              round
              dense
              flat
              type="submit"
              color="white"
              icon="send"
              @click="sendMessage"
            />
          </template>
        </q-input>
      </q-form>
    </q-toolbar>
  </div>
</template>

<script>
import { mapState, mapActions, mapGetters } from "vuex";
import { firebase, firebaseAuth } from "boot/firebase";

export default {
  components: {
    "chat-members": require("components/Chats/ChatMembers.vue").default,
  },
  props: [
    "title",
    "chatId",
    "subjectDocType",
    "subjectDocLineage",
    "subjectDocTitle",
  ],
  data() {
    return {
      newMessage: "",
      showMessages: true,
    };
  },
  computed: {
    ...mapState("users", ["currentUser"]),
    ...mapState("chats", ["currentChat"]),
    ...mapState("orgs", ["currentOrg"]),
    ...mapGetters("users", ["currentOrgUsers"]),
    messagesForDisplay() {
      if (this.currentChat) {
        return this.currentChat.newestMessages;
      } else return [];
    },
    messageCount() {
      return this.messagesForDisplay.length;
    },
  },
  methods: {
    ...mapActions("chats", [
      "fsAddChat",
      "fsAddMessage",
      "fsResetReadCount",
      "bindCurrentChat",
      "unbindCurrentChat",
    ]),

    async sendMessage() {
      if (!this.newMessage) return;

      let chatIdToUse = this.chatId;

      if (!this.chatId) {
        chatIdToUse = await this.fsAddChat({
          orgId: this.currentOrg.id,
          orgName: this.currentOrg.name,
          orgNameSlug: this.currentOrg.nameSlug,
          members: [],
          membersOnly: false,
          subjectDocType: this.subjectDocType,
          subjectDocLineage: this.subjectDocLineage,
          subjectDocTitle: this.subjectDocTitle,
          newestMessages: [],
        });
      }

      this.fsAddMessage({
        chatId: chatIdToUse,
        message: {
          text: this.newMessage,
          from: firebaseAuth.currentUser.uid,
          fromNameCached: this.getUserDisplayNameOrTruncatedEmail(
            firebaseAuth.currentUser.uid
          ),
          timestamp: firebase.firestore.Timestamp.now(),
        },
      });
      this.clearMessage();
    },

    clearMessage() {
      this.newMessage = "";
      this.$refs.newMessage.focus();
    },

    scrollToBottom() {
      let chatComponent = this.$refs.chatComponent;
      if (chatComponent) chatComponent.scrollTop = chatComponent.scrollHeight;
    },

    formatFirestoreTimestamp(ts) {
      const date = ts.toDate();
      const now = new Date();
      const isoString = new Date(
        date.getTime() - date.getTimezoneOffset() * 60000
      ).toISOString();
      let outputString = "";
      //include the year if it's not this year
      if (date.getFullYear() != now.getFullYear())
        outputString += isoString.slice(0, 5) + "-";
      //include the month and date if it's not today
      if (
        date.getFullYear() != now.getFullYear() ||
        date.getMonth() != now.getMonth() ||
        date.getDate() != now.getDate()
      )
        outputString += isoString.slice(5, 10) + " ";
      //always include the time
      outputString += isoString.slice(11, 16);
      return outputString;
    },

    getUserDisplayNameOrTruncatedEmail(userId) {
      let foundUser = this.currentOrgUsers.find((u) => u.id == userId);
      if (foundUser)
        return foundUser.displayName
          ? foundUser.displayName
          : foundUser.email.split("@")[0];
      else return userId;
    },

    getUserPhotoURL(userId) {
      let foundUser = this.currentOrgUsers.find((u) => u.id == userId);
      if (foundUser) return foundUser.photoURL ? foundUser.photoURL : undefined;
      else return null;
    },
  },
  watch: {
    chatId(newChatId, oldChatId) {
      this.unbindCurrentChat();
      this.newMessage = "";
      if (newChatId) {
        this.bindCurrentChat(newChatId);
      }
    },
    currentChat(newChat, oldChat) {
      if (newChat && newChat.unreadCounts[this.currentUser.id] > 0) {
        if (this.$q.appVisible)
          this.fsResetReadCount({
            chatId: newChat.id,
            userId: this.currentUser.id,
          });
      }
    },
    "$q.appVisible"(isVisible) {
      if (
        isVisible &&
        this.currentChat &&
        this.currentChat.unreadCounts[this.currentUser.id] > 0
      )
        this.fsResetReadCount({
          chatId: this.currentChat.id,
          userId: this.currentUser.id,
        });
    },
    messagesForDisplay() {
      this.$nextTick(function () {
        // Code that will run only after the
        // entire view has been re-rendered
        this.scrollToBottom();
      });
    },
  },
  mounted() {
    if (this.chatId) this.bindCurrentChat(this.chatId);
    /*this.firebaseGetMessages(this.$route.params.otherUserId)*/
  },
  destroyed() {
    this.unbindCurrentChat();
    /*this.firebaseStopGettingMessages()*/
  },
};
</script>

<style lang="stylus">
.component-chat {
}

.q-banner {
  top: 50px;
  z-index: 2;
  opacity: 0.8;
}

.q-message {
  z-index: 1;
}
</style>
