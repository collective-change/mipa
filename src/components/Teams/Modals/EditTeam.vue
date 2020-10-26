<template>
  <q-card>
    <modal-header>Edit Team</modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-team-name :name.sync="teamToSubmit.name" ref="modalTeamName" />
        <q-input
          v-model="teamToSubmit.goal"
          label="Goal"
          :rules="[val => !!val || 'Field is required']"
          clearable
        />
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
  props: ["team", "id"],
  data() {
    return {
      teamToSubmit: {},
    };
  },
  methods: {
    ...mapActions("teams", ["updateTeam"]),
    submitTeam() {
      this.updateTeam({
        id: this.id,
        updates: this.teamToSubmit,
      });
      this.$emit("close");
    },
  },
  mounted() {
    this.teamToSubmit = Object.assign({}, this.team);
  },
};
</script>
