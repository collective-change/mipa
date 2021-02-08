<template>
  <div>
    <!-- <q-select
      :label="label"
      @filter="filterFn"
      @filter-abort="abortFilterFn"
      :options="filteredUserOptions"
      emit-value
      map-options
      use-input
      v-bind:value="value"
      v-on:input="value => $emit('input', value)"
    />-->
    <div>
      <div class="row items-center">
        <div style="min-width: 250px; max-width: 300px">
          <q-select
            ref="selectRef"
            use-input
            v-model="members"
            multiple
            @filter="filterFn"
            @filter-abort="abortFilterFn"
            :options="filteredUserOptions"
            @add="addChatMember"
            @remove="removeChatMember"
            emit-value
            map-options
            use-chips
            stack-label
            dense
            hide-dropdown-icon
            :placeholder="members.length ? '' : 'Add members'"
            borderless
            class="q-pl-xs border-style:none;"
          >
            <template v-slot:selected-item="scope">
              <q-chip
                removable
                dense
                @remove="scope.removeAtIndex(scope.index)"
                color="white"
                text-color="secondary"
                class="q-ml-none"
              >
                {{ scope.opt.label }}
                <q-tooltip>{{ scope.opt.email }}</q-tooltip>
              </q-chip>
            </template>

            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps" v-on="scope.itemEvents">
                <q-item-section>
                  <q-item-label v-html="scope.opt.email" />
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

export default {
  props: ["chatId", "subjectDocType", "subjectDocLineage", "subjectDocTitle"],
  data() {
    return {
      members: [],
      filteredUserOptions: [],
      userOptions: [],
      showMemberSelect: false,
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("chats", ["currentChat"]),
    ...mapGetters("users", ["currentOrgUsers"]),
  },

  methods: {
    ...mapActions("chats", [
      "fsAddChat",
      "fsAddChatMember",
      "fsRemoveChatMember",
    ]),
    filterFn(val, update, abort) {
      update(() => {
        if (val === "") {
          this.filteredUserOptions = this.userOptions;
        } else {
          const needle = val.toLowerCase();
          this.filteredUserOptions = this.userOptions.filter(
            (v) => v.label.toLowerCase().indexOf(needle) > -1
          );
        }
      });
    },
    abortFilterFn() {
      // console.log('delayed filter aborted')
    },
    async addChatMember(details) {
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
      this.fsAddChatMember({ chatId: chatIdToUse, memberId: details.value });
    },

    removeChatMember(details) {
      this.fsRemoveChatMember({
        chatId: this.currentChat.id,
        memberId: details.value,
      });
    },

    regenerateOptionsForMemberSelection() {
      this.userOptions = this.currentOrg.users.map((userId) => {
        let foundUser = this.currentOrgUsers.find((u) => u.id == userId);
        return {
          label: foundUser ? foundUser.email.split("@")[0] : userId,
          value: userId,
          email: foundUser ? foundUser.email : userId,
        };
      });
      this.userOptions.sort((a, b) => {
        if (a.label.toLowerCase() < b.label.toLowerCase()) {
          return -1;
        }
        if (a.label.toLowerCase() > b.label.toLowerCase()) {
          return 1;
        }
        return 0;
      });
      this.filteredUserOptions = this.userOptions;
    },
  },
  created() {
    this.regenerateOptionsForMemberSelection();
  },
  watch: {
    currentChat() {
      if (this.currentChat) this.members = this.currentChat.members;
      else this.members = [];
    },

    currentOrgUsers() {
      this.regenerateOptionsForMemberSelection();
    },
  },
};
</script>
