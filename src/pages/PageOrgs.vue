<template>
  <q-page>
    <div class="q-pa-md absolute full-width full-height column">
      <template v-if="orgs!=null">
        <div class="text-h6">My Organizations</div>
        <no-orgs v-if="orgsLoaded && Object.keys(orgs).length==0" />
        <orgs :orgs="orgs" />
        <div class="absolute-bottom text-center q-mb-lg no-pointer-events">
          <q-btn
            @click="showAddOrg = true"
            label="add organization"
            class="all-pointer-events"
            color="primary"
            size="24px"
            icon="add"
          />
        </div>
      </template>
      <template v-else>
        <span class="absolute-center">
          <q-spinner color="primary" size="3em" />
        </span>
      </template>
    </div>
    <q-dialog v-model="showAddOrg">
      <add-org @close="showAddOrg=false" />
    </q-dialog>
  </q-page>
</template>

<script>
import { mapGetters, mapState, mapActions } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";

export default {
  data() {
    return {
      orgsLoaded: false,
      showAddOrg: false
    };
  },

  computed: {
    ...mapGetters("settings", ["settings"]),
    ...mapState("orgs", ["orgs"])
  },

  actions: {},

  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 200));
      this.$store.dispatch("orgs/bindOrgs");
    })();
    //console.log("above code doesn't block main function stack");
  },

  mounted() {
    //console.log(firebaseAuth.currentUser.uid);
    this.$root.$on("showAddOrg", () => {
      this.showAddOrg = true;
    });
  },

  beforeDestroy() {
    this.$store.dispatch("orgs/unbindOrgs");
  },

  watch: {
    orgs: function(newOrgs, oldOrgs) {
      if (
        oldOrgs != null &&
        newOrgs != null &&
        newOrgs.length == oldOrgs.length
      ) {
        this.orgsLoaded = true;
      }
    }
  },

  components: {
    "no-orgs": require("components/Orgs/NoOrgs.vue").default,
    orgs: require("components/Orgs/Orgs.vue").default,
    "add-org": require("components/Orgs/Modals/AddOrg.vue").default
  }
};
</script>

<style lang="scss">
.q-scroll-area-tasks {
  display: flex;
  flex-grow: 1;
}
.electron {
  .q-scroll-area-tasks {
    .scroll {
      height: auto !important;
    }
  }
}
</style>