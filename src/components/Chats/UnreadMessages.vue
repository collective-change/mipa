<template>
  <div>
    <q-btn v-if="loggedIn" round dense flat color="grey-8" icon="chat">
      <q-badge
        v-if="unreadMessagesCount > 0"
        color="blue-grey"
        text-color="white"
        floating
      >{{unreadMessagesCount}}</q-badge>
      <q-tooltip>{{ unreadMessagesCount > 0 ? $t("Unread messages") : $t("No unread messages") }}</q-tooltip>
      <q-menu>
        <q-list style="min-width: 100px">
          <div v-for="chat in unreadChats" :key="chat.id">
            <q-item clickable v-close-popup @click="$router.push(getRouteFromChat(chat))">
              <q-item-section>
                <q-item-label>
                  <q-badge color="green" text-color="white" class="q-mr-xs">
                    {{chat.orgNameCached.charAt(0).toUpperCase()}}
                    <q-tooltip>{{ chat.orgNameCached }}</q-tooltip>
                  </q-badge>
                  <q-badge color="orange" text-color="white" class="q-mr-xs">
                    {{chat.subjectDocType.charAt(0).toUpperCase()}}
                    <q-tooltip>{{ chat.subjectDocType }}</q-tooltip>
                  </q-badge>
                  {{chat.subjectDocTitle}}
                </q-item-label>
                <q-item-label
                  caption
                >{{chat.newestMessages[chat.newestMessages.length -1].fromNameCached}}: {{chat.newestMessages[chat.newestMessages.length -1].text}}</q-item-label>
              </q-item-section>
              <q-item-section side top>
                <q-badge color="blue-grey" text-color="white">{{chat.unreadCounts[userId]}}</q-badge>
                <q-item-label>{{formatFirestoreTimestamp(chat.newestMessages[chat.newestMessages.length -1].timestamp)}}</q-item-label>
              </q-item-section>
            </q-item>
            <q-separator />
          </div>
        </q-list>
      </q-menu>
    </q-btn>
    <!--unreadChats: {{unreadChats}} -->
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

  export default {
    data() {
      return {}
    },
      created: function () {
        this.$store.dispatch("chats/bindUnreadChats", this.userId);
  },

    computed: {    
      ...mapState("auth", ["loggedIn", "userId"]),
      //...mapState("orgs", ["currentOrg"]),
      ...mapGetters('chats', ['unreadChats']),
      ...mapGetters("users", ["currentOrgUsers"]),
      unreadMessagesCount(){
        let that = this;
        if (this.userId && this.unreadChats)
        return this.unreadChats.reduce(function(unreadMessagesCount, chat) {
          return unreadMessagesCount + chat.unreadCounts[that.userId];
        }, 0)
        else return 0;
      }

    },

    methods: {
      ...mapActions('chats', ['fsAddChat', 'fsAddChatMember', 'fsRemoveChatMember']),
      
      formatFirestoreTimestamp(ts) {
        const date = ts.toDate();
        const now = new Date();
        const isoString= new Date(date.getTime() - (date.getTimezoneOffset() * 60000 )).toISOString();
        let outputString = '';
        //include the year if it's not this year
        if (date.getFullYear() != now.getFullYear()) outputString += isoString.slice(0,5) + '-';
        //include the month and date if it's not today
        if (date.getFullYear() != now.getFullYear() || date.getMonth() != now.getMonth() || date.getDate() != now.getDate()) outputString += isoString.slice(5,10) + ' ';
        //always include the time
        outputString += isoString.slice(11,16);
        return outputString;
      },

      getUserDisplayNameOrTruncatedEmail(userId) {
        let foundUser = this.currentOrgUsers.find(u => u.id == userId);
        if (foundUser)
          return foundUser.displayName ? foundUser.displayName : foundUser.email.split('@')[0];
        else return userId;
      },

      getRouteFromChat(chat){
        let routeObj = {};
        switch(chat.subjectDocType) {
          case 'node':
            routeObj = {
              name: 'model-node', 
              params:{orgNameSlug: chat.orgNameSlugCached ? chat.orgNameSlugCached : '-', orgId: chat.orgId, modelId: chat.subjectDocLineage.modelId, nodeId:chat.subjectDocLineage.nodeId}, 
            };
            break;
          case 'action':
            routeObj = {};
          default:
            console.error(`Document type does not exist in getRuteFromSubjectDoc`);
        }
        return routeObj;
      }
    },
    watch: {

    }
  }
</script>
