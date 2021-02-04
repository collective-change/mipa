<template>
  <div
    ref="chatComponent"
    class="component-chat flex column"
    style="border-style: solid; border-color: #bbb; border-width: 1px;"
  >
    <div
      :class="{ 'invisible' : !showMessages }"
      class="q-pa-md column col justify-end"
      style="min-height: 300px; max-height:300px;"
    >
      <div v-if="currentChat">
        <q-chat-message
          v-for="(message, key) in currentChat.newestMessages"
          :key="key"
          :name="message.from == currentUser.id ? '' : getUserDisplayNameOrEmail(message.from)"
          :avatar="message.from == currentUser.id ? undefined : getUserPhotoURL(message.from)"
          :text="[message.text]"
          :sent="message.from == currentUser.id ? true : false"
          :stamp="formatFirestoreTimestamp(message.timestamp)"
          :bg-color="message.from == currentUser.id ? 'light-green-2' : 'grey-4'"
          name-sanitize
          text-sanitize
        />
      </div>
    </div>
    <q-toolbar class="bg-primary">
      <q-form class="full-width">
        <q-input
          v-model="newMessage"
          @blur="scrollToBottom"
          ref="newMessage"
          bg-color="white"
          rounded
          outlined
          placeholder="Message"
          dense
        >
          <template v-slot:after>
            <q-btn round dense flat type="submit" color="white" icon="send" @click="sendMessage" />
          </template>
        </q-input>
      </q-form>
    </q-toolbar>
  </div>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import { firebase, firebaseAuth } from "boot/firebase";
	//import mixinOtherUserDetails from 'src/mixins/mixin-other-user-details.js'

	export default {
        //mixins: [mixinOtherUserDetails],
        props: ['title', 'chatId', 'subjectDocType', 'subjectDocLineage', 'subjectDocTitle'],
	  data() {
	  	return {
            //newestMessages: [{id: 0, from:"me", "text": ['test from Ted'], stamp:"5:15 PM"}, {id: 1, from:"Joe", "text": ['test from Joe'], stamp:"6:28 PM"}],
            //newestMessages: [],
            /* the above temporarily added by Ted for development */
	  		newMessage: '',
	  		showMessages: true
	  	}
	  },
	  computed: {
      ...mapState("users", ['currentUser']),
      ...mapState('chats', ['currentChat']),
      ...mapState("orgs", ["currentOrg"]),
      ...mapGetters("users", ["currentOrgUsers"]),
	  },
	  methods: {
      ...mapActions('chats', ['addChat', 'addMessage', 'bindCurrentChat', 'unbindCurrentChat']),
      
	  	async sendMessage() {
        let chatIdToUse = this.chatId;

        if (!this.chatId) {
          chatIdToUse = await this.addChat({
            orgId: this.currentOrg.id,
            members: [],
            membersOnly: false,
            subjectDocType: this.subjectDocType,
            subjectDocLineage: this.subjectDocLineage,
            subjectDocTitle: this.subjectDocTitle,
            newestMessages: []
        });
        }

	  		this.addMessage({
          chatId: chatIdToUse,
	  			message: {
		  			text: this.newMessage,
            from: firebaseAuth.currentUser.uid,
            //timestamp: firebase.firestore.FieldValue.serverTimestamp()
            timestamp: firebase.firestore.Timestamp.now()
	  			},
	  		})
	  		this.clearMessage();
      },
      
	  	clearMessage() {
	  		this.newMessage = ''
	  		this.$refs.newMessage.focus()
      },
      
	  	scrollToBottom() {
	  		let chatComponent = this.$refs.chatComponent
	  		setTimeout(() => {
		  		window.scrollTo(0, chatComponent.scrollHeight)
	  		}, 20);
      },
      
      formatFirestoreTimestamp(ts) {
        const date = ts.toDate();
        const now = new Date();
        const isoString= new Date(date.getTime() - (date.getTimezoneOffset() * 60000 )).toISOString();
        let outputString = '';
        //include the year if it's not this year
        if (date.getFullYear() != now.getFullYear()) outputString += isoString.slice(0,5) + '-';
        //include the month and date if it's not today
        if (date.getMonth() != now.getMonth() && date.getDate() != now.getDate()) outputString += isoString.slice(5,5) + ' ';
        //always include the time
        outputString += isoString.split("T")[1].slice(0,5);
        return outputString;
      },

      getUserDisplayNameOrEmail(userId) {
        let foundUser = this.currentOrgUsers.find(u => u.id = userId);
        return foundUser.displayName ? foundUser.displayName : foundUser.email;
      },

      getUserPhotoURL(userId) {
        let foundUser = this.currentOrgUsers.find(u => u.id = userId);
        return foundUser.photoURL ? foundUser.photoURL : undefined;
      }
	  },
	  watch: {
      chatId: function(chatId) {
        this.unbindCurrentChat();
        if (this.chatId) this.bindCurrentChat(this.chatId);
        this.newMessage = ''
      },

	  	newestMessages: function(val) {
	  		if (Object.keys(val).length || true) {
	  			this.scrollToBottom()
	  			setTimeout(() => {
	  				this.showMessages = true
	  			}, 200)
        }
        //TODO: clear user's unread messages for this chat
        //TODO: set chat.members[userId].unreadCount = 0
	  	}
	  },
	  mounted() {
      if (this.chatId) this.bindCurrentChat(this.chatId);
	  	/*this.firebaseGetMessages(this.$route.params.otherUserId)*/
	  },
	  destroyed() {
      this.unbindCurrentChat();
	  	/*this.firebaseStopGettingMessages()*/
	  }
	}
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
