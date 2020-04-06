<template>
  <q-card>
    <modal-header>Add a new organization</modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-org-name :name.sync="orgToSubmit.name" ref="modalOrgName" />
        <q-input
          v-model="orgToSubmit.goal"
          label="Goal"
          :rules="[val => !!val || 'Field is required']"
          clearable
        />
        <q-select v-model="orgToSubmit.orgType" :options="options" emit-value label="Type" />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions } from "vuex";
import mixinAddEditOrg from "src/mixins/mixin-add-edit-org";

export default {
  mixins: [mixinAddEditOrg],
  data() {
    return {
      options: [
        { label: "Just me", value: "personal" },
        { label: "Family", value: "family" },
        { label: "Friends and community", value: "friendsAndCommunity" },
        { label: "School project", value: "schoolProject" },
        { label: "Business", value: "business" },
        { label: "Non-profit", value: "non-profit" },
        { label: "Government", value: "government" },
        { label: "Other", value: "other" }
      ],
      orgToSubmit: {
        name: "",
        goal: "",
        orgType: ""
      }
    };
  },
  methods: {
    ...mapActions("orgs", ["addOrg"]),

    submitOrg() {
      this.addOrg(this.orgToSubmit);
      console.log(this.orgToSubmit);
      this.$emit("close");
    }
  }
};
</script>
