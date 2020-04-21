<template>
  <div>
    <div v-if="selectedIssue">
      <div class="text-h6">{{selectedIssue.name}}</div>

      <q-form @submit.prevent="submitForm">
        <q-input
          v-model="issueToSubmit.name"
          label="Name"
          :rules="[val => !!val || 'Field is required']"
          clearable
          ref="issueName"
        />
        <q-input v-model="issueToSubmit.details" label="Details" clearable />

        <modal-buttons />
      </q-form>
    </div>
    <p>selectedIssue {{selectedIssueId}}</p>
    <pre>{{selectedIssue}}</pre>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  },

  data() {
    return {
      issueToSubmit: {}
      //model: null
    };
  },

  computed: {
    ...mapState("ui", ["selectedIssueId"]),
    ...mapState("issues", ["issues"]),

    selectedIssue() {
      let that = this;
      return this.issues.find(function(issue) {
        return issue.id == that.selectedIssueId;
      });
    }
  },

  methods: {
    ...mapActions("model", ["updateIssue"]),
    submitForm() {
      this.$refs.issueName.validate();
      if (!this.$refs.issueName.hasError) {
        this.submitIssue();
      }
    },
    submitIssue() {
      let payload = {
        id: this.selectedIssueId,
        updates: this.issueToSubmit
      };
      this.$store.dispatch("issues/updateIssue", payload);
      /*this.updateIssue({
        modelId: this.$route.params.modelId,
        updates: this.issueToSubmit
      });*/
      //this.$emit("close");
    }
  },

  mounted() {},

  watch: {
    selectedIssue: function(newIssue, oldIssue) {
      this.issueToSubmit = Object.assign({}, this.selectedIssue);
    }
  }
};
</script>
