<template>
  <div>
    <q-btn v-if="loggedIn" round dense flat color="grey-8" icon="chat">
      <q-badge
        v-if="unreadChats && unreadChats.length > 0"
        color="blue-grey"
        text-color="white"
        floating
      >{{unreadChats.length}}</q-badge>
      <q-tooltip>{{ $t("Messages") }}</q-tooltip>
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
      ...mapState('chats', ['unreadChats']),
      //...mapGetters("users", ["currentOrgUsers"]),


    },

    methods: {
      ...mapActions('chats', ['fsAddChat', 'fsAddChatMember', 'fsRemoveChatMember']),
    },
    watch: {

    }
  }
</script>
