<template>
  <q-page class="q-pa-md">
    <template v-if="orgs != null">
      <div class="row items-center q-mb-md">
        <div class="text-h5">{{ $t("My organizations") }}</div>
        <q-space />
        <q-btn
          v-if="orgs.length && !hasSample"
          @click="createSample"
          :label="$t('sampleTry')"
          :loading="creatingSample"
          color="primary"
          icon="explore"
          flat
          no-caps
          class="q-mr-sm"
        >
          <q-tooltip max-width="280px">{{ $t("sampleTryHint") }}</q-tooltip>
        </q-btn>
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
      <my-invitations />
      <no-orgs
        v-if="orgs.length == 0"
        :creating-sample="creatingSample"
        @add-org="showAddOrg = true"
        @try-sample="createSample"
      />
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
import { showErrorMessage } from "@/utils/util-show-error-message";
import NoOrgs from "@/components/Orgs/NoOrgs.vue";
import MyInvitations from "@/components/Orgs/MyInvitations.vue";
import Orgs from "@/components/Orgs/Orgs.vue";
import AddOrg from "@/components/Orgs/Modals/AddOrg.vue";

export default {
  data() {
    return {
      //orgsLoaded: false,
      showAddOrg: false,
      creatingSample: false
    };
  },

  computed: {
    ...mapGetters("settings", ["settings"]),
    ...mapState("orgs", ["orgs"]),
    hasSample() {
      return (this.orgs || []).some(org => org.isSample);
    }
  },

  methods: {
    async createSample() {
      this.creatingSample = true;
      try {
        const { orgId, nameSlug } = await this.$store.dispatch("orgs/createSampleOrg");
        this.$router.push(`/org/${nameSlug}/model/${orgId}/${orgId}`);
      } catch (error) {
        showErrorMessage(this.$t("sampleFailed"), error.message);
      } finally {
        this.creatingSample = false;
      }
    }
  },

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
    "my-invitations": MyInvitations,
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
