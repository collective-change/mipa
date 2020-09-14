<template>
  <q-card>
    <modal-header v-slot:header>Edit Organization</modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-org-name :name.sync="orgToSubmit.name" ref="modalOrgName" />
        <q-input
          v-model="orgToSubmit.goal"
          label="Goal"
          :rules="[val => !!val || 'Field is required']"
          clearable
        />
        <modal-org-currency :currency.sync="orgToSubmit.currency" ref="modalOrgCurrency" />
      </q-card-section>
      <modal-buttons />
    </q-form>
    <pre>{{exchangeRates}}</pre>
  </q-card>
</template>

<script>
import { mapActions } from "vuex";
import mixinAddEditOrg from "src/mixins/mixin-add-edit-org";

export default {
  mixins: [mixinAddEditOrg],
  props: ["org", "id"],
  data() {
    return {
      orgToSubmit: {},
    };
  },

  methods: {
    ...mapActions("orgs", ["updateOrg"]),
    submitOrg() {
      this.updateOrg({
        id: this.id,
        updates: this.orgToSubmit,
      });
      this.$emit("close");
    },
  },
  mounted() {
    this.orgToSubmit = Object.assign({}, this.org);
  },
};
</script>
