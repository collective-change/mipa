<template>
  <q-card>
    <modal-header v-slot:header>Add a new team</modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-team-name :name.sync="teamToSubmit.name" ref="modalTeamName" />
        <q-input
          v-model="teamToSubmit.goal"
          label="Goal"
          :rules="[val => !!val || 'Field is required']"
          clearable
        />
        <!-- <q-select v-model="teamToSubmit.teamType" :options="options" emit-value label="Type" /> -->
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions } from "vuex";
import mixinAddEditTeam from "src/mixins/mixin-add-edit-team";

export default {
  mixins: [mixinAddEditTeam],
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
        { label: "Other", value: "other" },
      ],
      teamToSubmit: {
        name: "",
        goal: "",
        teamType: "",
      },
    };
  },
  methods: {
    ...mapActions("teams", ["addTeam"]),

    submitTeam() {
      this.addTeam(this.teamToSubmit);
      console.log(this.teamToSubmit);
      this.$emit("close");
    },
  },
};
</script>
