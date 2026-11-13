<template>
  <q-page class="q-pa-md">
    <template v-if="orgs != null">
      <div class="row items-center q-mb-md">
        <div class="text-h5">{{ $t("My organizations") }}</div>
        <q-space />
        <q-btn
          v-if="orgs.length"
          @click="showAddOrg = true"
          :label="$t('Add organization')"
          color="primary"
          icon="add"
          unelevated
          no-caps
        />
      </div>
      <no-orgs @add-org="showAddOrg = true" v-if="orgs.length == 0" />
      <orgs v-else :orgs="orgs" />
    </template>
    <div v-else class="absolute-center">
      <q-spinner color="primary" size="3em" />
    </div>
    <q-dialog v-model="showAddOrg">
      <add-org @close="showAddOrg = false" />
    </q-dialog>
  </q-page>
</template>

<script>
import { mapGetters, mapState, mapActions } from "vuex";
import { firebaseApp, firebaseDb, firebaseAuth } from "@/boot/firebase";
import NoOrgs from "@/components/Orgs/NoOrgs.vue";
import Orgs from "@/components/Orgs/Orgs.vue";
import AddOrg from "@/components/Orgs/Modals/AddOrg.vue";

export default {
  data() {
    return {
      //orgsLoaded: false,
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


  beforeUnmount() {
    this.$store.dispatch("orgs/unbindOrgs");
  },

  watch: {
    /*orgs: function(newOrgs, oldOrgs) {
      if (
        oldOrgs != null &&
        newOrgs != null &&
        newOrgs.length == oldOrgs.length
      ) {
        this.orgsLoaded = true;
      }
    }*/
  },

  components: {
    "no-orgs": NoOrgs,
    orgs: Orgs,
    "add-org": AddOrg
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
