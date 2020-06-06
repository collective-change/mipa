<template>
  <q-card>
    <modal-header v-slot:header>Configure model</modal-header>
    <q-form @submit.prevent="submitModel">
      <q-card-section>
        <q-input
          v-model="modelToSubmit.name"
          label="Name"
          :rules="[val => !!val || 'Field is required']"
        />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapState, mapActions } from "vuex";
//import mixinAddEditOrg from "src/mixins/mixin-add-edit-org";

export default {
  //props: ["org", "id"],
  data() {
    return {
      modelToSubmit: {}
    };
  },
  components: {
    "modal-header": require("components/Shared/ModalComponents/ModalHeader.vue")
      .default,
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default,
    "modal-org-name": require("components/Orgs/Modals/Shared/ModalOrgName.vue")
      .default
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"])
  },
  methods: {
    ...mapActions("model", ["updateModel"]),
    submitModel() {
      this.updateModel({
        modelId: this.currentModel.id,
        updates: this.modelToSubmit
      });
      this.$emit("close");
    }
  },

  mounted() {
    this.modelToSubmit = Object.assign({}, this.currentModel);
  }
};
</script>
