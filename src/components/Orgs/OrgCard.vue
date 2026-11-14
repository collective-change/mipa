<template>
  <q-card class="org-card column">
    <q-card-section class="bg-primary text-white">
      <div class="text-h6 ellipsis">{{ org.name }}</div>
      <q-badge v-if="org.isSample" color="white" text-color="primary" :label="$t('sampleChip')" />
      <div v-if="org.goal" class="text-body2 org-goal">{{ org.goal }}</div>
    </q-card-section>

    <q-card-section class="q-pa-sm col-grow">
      <q-list dense>
        <q-item
          clickable
          :to="`/org/${org.nameSlug}/model/${id}/${id}`"
          class="rounded-borders"
        >
          <q-item-section avatar>
            <q-icon name="share" class="rotate-90" color="primary" />
          </q-item-section>
          <q-item-section>{{ $t("ModelNoun") }}</q-item-section>
        </q-item>
        <q-item
          clickable
          :to="{
            name: 'actions',
            params: { orgNameSlug: org.nameSlug, orgId: id },
          }"
          class="rounded-borders"
        >
          <q-item-section avatar>
            <q-icon name="wb_incandescent" class="flip-vertical" color="primary" />
          </q-item-section>
          <q-item-section>{{ $t("Actions") }}</q-item-section>
        </q-item>
        <q-item
          clickable
          :to="{
            name: 'my-todo',
            params: { orgNameSlug: org.nameSlug, orgId: id },
          }"
          class="rounded-borders"
        >
          <q-item-section avatar>
            <q-icon name="checklist" color="primary" />
          </q-item-section>
          <q-item-section>{{ $t("My todo") }}</q-item-section>
        </q-item>
        <q-item
          clickable
          :to="{
            name: 'members',
            params: { orgNameSlug: org.nameSlug, orgId: id },
          }"
          class="rounded-borders"
        >
          <q-item-section avatar>
            <q-icon name="group" color="primary" />
          </q-item-section>
          <q-item-section>{{ $t("Members") }}</q-item-section>
        </q-item>
      </q-list>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <q-btn
        @click.stop="showEditOrgModal"
        flat
        round
        dense
        icon="edit"
        :aria-label="$t('Edit organization')"
      >
        <q-tooltip>{{ $t("Edit organization") }}</q-tooltip>
      </q-btn>
      <q-btn
        v-if="org.superAdmins.includes(userId)"
        @click.stop="promptToDelete(id)"
        flat
        round
        dense
        icon="delete"
        :aria-label="$t('Delete organization')"
      >
        <q-tooltip>{{ $t("Delete organization") }}</q-tooltip>
      </q-btn>
    </q-card-actions>

    <q-dialog v-model="showEditOrg">
      <edit-org @close="showEditOrg = false" :org="org" :id="id" />
    </q-dialog>
  </q-card>
</template>

<script>
import { mapState, mapActions, mapGetters } from "vuex";
import EditOrg from "@/components/Orgs/Modals/EditOrg.vue";

export default {
  props: ["org", "id"],
  data() {
    return {
      showEditOrg: false,
    };
  },
  computed: {
    ...mapGetters("settings", ["settings"]),
    ...mapState("auth", ["userId"]),
  },
  methods: {
    ...mapActions("orgs", ["updateOrg", "deleteOrg"]),
    showEditOrgModal() {
      this.showEditOrg = true;
    },
    promptToDelete(orgId) {
      this.$q
        .dialog({
          title: this.$t("Delete organization"),
          message: this.$t("deleteOrgConfirm", { name: this.org.name }),
          cancel: true,
          persistent: true,
        })
        .onOk(() => {
          this.deleteOrg(orgId);
        });
    },
  },
  components: {
    "edit-org": EditOrg,
  },
};
</script>

<style lang="scss" scoped>
.org-card {
  width: 100%;
  height: 100%;
}

.org-goal {
  opacity: 0.9;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.q-card__actions .q-btn {
  color: $grey-7;
}
</style>
