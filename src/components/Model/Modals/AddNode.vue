<template>
  <q-card>
    <modal-header>
      <template v-slot:header>{{
        newNodeRole == "influencer"
          ? $t("Add a factor this one uses")
          : newNodeRole == "influencee"
          ? $t("Add a factor that uses this one")
          : $t("Add factor")
      }}</template>
    </modal-header>
    <q-form @submit.prevent="submitForm">
      <q-card-section>
        <modal-node-name
          :name="nodeToSubmit.name"
          @update:name="onNameUpdated"
          ref="modalNodeName"
        />
        <q-input
          v-model="nodeToSubmit.symbol"
          :label="$t('Short name')"
          :hint="$t('shortNameHint')"
          debounce="300"
          @update:model-value="symbolTouched = true"
          :rules="[
            (val) => !!val || $t('Required'),
            (val) =>
              isNaN(parseInt((val || '').substring(0, 1))) ||
              $t('Cannot start with a number'),
            (val) =>
              isAlphanumeric(val) ||
              $t('shortNameCharacters'),
            (val) =>
              isSymbolUnique(val) ||
              $t('shortNameUnique'),
          ]"
          ref="modalNodeSymbol"
        />
      </q-card-section>
      <modal-buttons />
    </q-form>
  </q-card>
</template>

<script>
import { mapActions, mapState } from "vuex";
import { camelize } from "@/utils/util-camelize";
import ModalHeader from "@/components/Shared/ModalComponents/ModalHeader.vue";
import ModalButtons from "@/components/Shared/ModalComponents/ModalButtons.vue";
import ModalNodeName from "@/components/Model/Modals/Shared/ModalNodeName.vue";

export default {
  props: ["sourceNodeId", "newNodeRole"],
  components: {
    "modal-header": ModalHeader,
    "modal-buttons": ModalButtons,
    "modal-node-name": ModalNodeName,
  },
  data() {
    return {
      nodeToSubmit: {
        name: "",
        symbol: "",
        class: "unlinked",
      },
      symbolTouched: false,
    };
  },

  computed: {
    ...mapState("model", ["nodes"]),
  },

  methods: {
    ...mapActions("model", ["addNode"]),

    onNameUpdated(val) {
      this.nodeToSubmit.name = val;
      if (!this.symbolTouched) {
        const candidate = camelize(val || "");
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(candidate)) {
          this.nodeToSubmit.symbol = candidate;
        } else {
          this.nodeToSubmit.symbol = "";
        }
      }
    },

    isAlphanumeric(str) {
      return str ? /^[a-z0-9_]+$/i.test(str) : false;
    },

    isSymbolUnique(val) {
      if (!val || !this.nodes) return true;
      return !this.nodes.some((node) => node.symbol === val);
    },

    submitForm() {
      this.$refs.modalNodeName.$refs.name.validate();
      this.$refs.modalNodeSymbol.validate();
      if (
        !this.$refs.modalNodeName.$refs.name.hasError &&
        !this.$refs.modalNodeSymbol.hasError
      ) {
        this.submitNode();
      }
    },

    submitNode() {
      this.nodeToSubmit.symbolFormula = `delay(${this.nodeToSubmit.symbol}, dt, 0)`;
      this.nodeToSubmit.isNew = true;
      this.addNode({
        node: this.nodeToSubmit,
        sourceNodeId: this.sourceNodeId,
        newNodeRole: this.newNodeRole,
        modelId: this.$route.params.modelId,
      });
      this.$emit("close");
    },
  },
};
</script>
