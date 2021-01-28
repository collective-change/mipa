<template>
  <div>
    <q-select
      :label="label"
      @filter="filterFn"
      @filter-abort="abortFilterFn"
      :options="filteredUserOptions"
      emit-value
      map-options
      use-input
      v-bind:value="value"
      v-on:input="value => $emit('input', value)"
    />
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

  export default {
    props:['label', "value"],
    data() {
      return {
        filteredUserOptions: [],
        selectedUser: ''
      }
    },
      created: function () {
    //compose option values first, so we don't need to wait
    //for filteredUserOptions to compute, which results in q-select
    //displaying option value instead of option label.
    this.filteredUserOptions = this.userOptions;
  },

    computed: {    
      ...mapState("orgs", ["currentOrg"]),
      ...mapGetters("users", ["currentOrgUsers"]),

      userOptions() {
        return this.currentOrg.users.map((userId) => {
            let foundUser = this.currentOrgUsers.find(u => u.id == userId);
          return { label: foundUser ? foundUser.email : userId, value: userId };
        });
      },
    },

    methods: {
        filterFn(val, update, abort) {
        update(() => {
            if (val === "") {
            this.filteredUserOptions = this.userOptions;
            } else {
            const needle = val.toLowerCase();
            this.filteredUserOptions = this.userOptions.filter(
                v => v.label.toLowerCase().indexOf(needle) > -1
            );
            }
            this.filteredUserOptions.sort((a, b) => {
            if (a.label.toLowerCase() < b.label.toLowerCase()) {
                return -1;
            }
            if (a.label.toLowerCase() > b.label.toLowerCase()) {
                return 1;
            }
            return 0;
            });
        });
        },
        abortFilterFn() {
        // console.log('delayed filter aborted')
        },
    }

  }
</script>
