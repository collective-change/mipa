<template>
  <q-page>
    <div class="q-pa-md absolute full-width full-height column">
      <template v-if="orgsDownloaded">
        <div class="text-h6">Teams</div>
        <no-orgs v-if="!Object.keys(orgs).length" />
        <orgs :orgs="orgs" />
        <div class="absolute-bottom text-center q-mb-lg no-pointer-events">
          <q-btn
            @click="showAddOrg = true"
            round
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
      showAddOrg: false
    };
  },

  computed: {
    ...mapGetters("settings", ["settings"]),
    ...mapState("orgs", ["orgs", "orgsDownloaded"])
  },

  actions: {
    ...mapActions("orgs", ["fbReadData", "detachUserOrgsListenerAction"])
  },

  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise(resolve => setTimeout(resolve, 1000));
      //console.log("currentUser is defined");
      this.$store.dispatch("orgs/fbReadData");
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
    this.$store.dispatch("orgs/detachUserOrgsListenerAction");
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