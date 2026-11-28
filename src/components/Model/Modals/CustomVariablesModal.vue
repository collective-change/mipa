<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: 640px; max-width: 900px; width: 100%">
      <q-card-section class="row items-center justify-between q-pb-none">
        <div class="row items-center text-h6 text-primary">
          <q-icon name="data_object" class="q-mr-sm" size="24px" />
          {{ $t("customVariablesTitle") }}
        </div>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-sm">
        <div class="text-body2 text-grey-8 q-mb-sm">
          {{ $t("customVariablesHelp") }}
        </div>

        <q-banner v-if="readOnly" dense rounded class="bg-blue-1 text-primary q-mb-md">
          <template v-slot:avatar>
            <q-icon name="visibility" color="primary" />
          </template>
          {{ $t("stakeholderViewerNotice") }}
        </q-banner>

        <!-- New Variable Form (for editors only) -->
        <q-card v-if="!readOnly" flat bordered class="q-pa-md bg-grey-1 q-mb-md">
          <div class="text-subtitle2 text-weight-bold q-mb-sm text-grey-9">
            {{ isEditing ? $t("editVariableBtn") : $t("addVariableBtn") }}
          </div>
          <q-form @submit.prevent="saveVariable" ref="variableForm">
            <div class="row q-col-gutter-sm items-start">
              <div class="col-12 col-sm-4">
                <q-input
                  v-model.trim="form.name"
                  :label="$t('varNameLabel')"
                  dense
                  filled
                  :disable="isEditing"
                  :rules="[
                    val => !!val || $t('Required'),
                    val => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(val) || $t('varNameInvalid'),
                    val => isEditing || !isDuplicateName(val) || $t('varNameDuplicate')
                  ]"
                  class="font-mono"
                  placeholder="e.g. retailPrice"
                />
              </div>

              <div class="col-12 col-sm-3">
                <q-input
                  v-model.number="form.value"
                  :label="$t('varValueLabel')"
                  type="number"
                  step="any"
                  dense
                  filled
                  :rules="[
                    val => val !== '' && val !== null && !isNaN(val) || $t('varValueInvalid')
                  ]"
                  placeholder="e.g. 45"
                />
              </div>

              <div class="col-12 col-sm-3">
                <q-input
                  v-model.trim="form.unit"
                  :label="$t('varUnitLabel')"
                  dense
                  filled
                  placeholder="e.g. USD, kg"
                />
              </div>

              <div class="col-12 col-sm-2 row items-center justify-end">
                <q-btn
                  type="submit"
                  color="primary"
                  unelevated
                  no-caps
                  :icon="isEditing ? 'check' : 'add'"
                  :label="isEditing ? $t('editVariableBtn') : $t('addVariableBtn')"
                  class="full-width"
                />
              </div>

              <div class="col-12">
                <q-input
                  v-model.trim="form.description"
                  :label="$t('varDescLabel')"
                  dense
                  filled
                  placeholder="e.g. Standard retail selling price per item"
                />
              </div>
            </div>

            <div v-if="isEditing" class="row justify-end q-mt-xs">
              <q-btn
                flat
                dense
                no-caps
                color="grey-7"
                :label="$t('Cancel')"
                @click="cancelEditing"
                class="q-mr-sm"
              />
            </div>
          </q-form>
        </q-card>

        <!-- Variables Filter Bar & Count -->
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <span class="text-subtitle2 text-weight-bold">{{ $t("customVariablesTitle") }}</span>
            <q-badge color="primary" class="q-px-sm">
              {{ variablesList.length }}
            </q-badge>
          </div>

          <div style="min-width: 220px">
            <q-input
              v-model="searchQuery"
              dense
              filled
              clearable
              placeholder="Search variables..."
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
        </div>

        <!-- Custom Variables Table -->
        <q-table
          :rows="filteredVariables"
          :columns="columns"
          row-key="name"
          dense
          flat
          bordered
          :pagination="{ rowsPerPage: 10 }"
          :no-data-label="$t('noCustomVariables')"
        >
          <template v-slot:body-cell-name="props">
            <q-td :props="props">
              <q-chip
                dense
                color="blue-1"
                text-color="primary"
                class="font-mono text-weight-bold cursor-pointer"
                icon="data_object"
                @click="copySnippet(props.row.name)"
              >
                {{ props.row.name }}
                <q-tooltip>{{ $t("clickToCopy") || "Click to copy" }}</q-tooltip>
              </q-chip>
            </q-td>
          </template>

          <template v-slot:body-cell-value="props">
            <q-td :props="props">
              <span class="text-weight-medium">{{ props.row.value }}</span>
              <span v-if="props.row.unit" class="text-caption text-grey-8 q-ml-xs">
                {{ props.row.unit }}
              </span>
            </q-td>
          </template>

          <template v-slot:body-cell-description="props">
            <q-td :props="props" class="text-grey-8">
              {{ props.row.description || "-" }}
            </q-td>
          </template>

          <template v-slot:body-cell-actions="props">
            <q-td :props="props" class="text-right">
              <q-btn
                v-if="!readOnly"
                flat
                round
                dense
                color="primary"
                icon="edit"
                size="sm"
                @click="startEditing(props.row)"
              >
                <q-tooltip>{{ $t("editVariableBtn") }}</q-tooltip>
              </q-btn>
              <q-btn
                v-if="!readOnly"
                flat
                round
                dense
                color="negative"
                icon="delete"
                size="sm"
                @click="confirmDelete(props.row.name)"
              >
                <q-tooltip>{{ $t("deleteVariableBtn") }}</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat :label="$t('Close')" color="primary" v-close-popup no-caps />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { pickActions } from "@/store/pinia-helpers";
import { useModelStore } from "@/store/store-model";
import { copyToClipboard, Notify } from "quasar";

export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    model: {
      type: Object,
      default: () => ({})
    },
    readOnly: {
      type: Boolean,
      default: false
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      searchQuery: "",
      isEditing: false,
      editingName: "",
      form: {
        name: "",
        value: null,
        unit: "",
        description: ""
      }
    };
  },
  computed: {
    modelId() {
      return this.model?.id || this.$route?.params?.modelId || this.$route?.params?.orgId || "";
    },
    variablesList() {
      const vars = this.model?.customVariables;
      if (Array.isArray(vars)) return vars;
      if (vars && typeof vars === "object") {
        return Object.entries(vars).map(([name, item]) => ({
          name,
          ...(typeof item === "object" && item !== null ? item : { value: item })
        }));
      }
      return [];
    },
    filteredVariables() {
      if (!this.searchQuery || !this.searchQuery.trim()) {
        return this.variablesList;
      }
      const q = this.searchQuery.trim().toLowerCase();
      return this.variablesList.filter(
        v =>
          (v.name && v.name.toLowerCase().includes(q)) ||
          (v.unit && v.unit.toLowerCase().includes(q)) ||
          (v.description && v.description.toLowerCase().includes(q))
      );
    },
    columns() {
      return [
        {
          name: "name",
          required: true,
          label: this.$t ? this.$t("varNameLabel") : "Name",
          align: "left",
          field: "name",
          sortable: true
        },
        {
          name: "value",
          label: this.$t ? this.$t("varValueLabel") : "Value",
          align: "left",
          field: "value",
          sortable: true
        },
        {
          name: "description",
          label: this.$t ? this.$t("varDescLabel") : "Description",
          align: "left",
          field: "description"
        },
        {
          name: "actions",
          label: "",
          align: "right",
          field: "name"
        }
      ];
    }
  },
  methods: {
    ...pickActions(useModelStore, [
      "addCustomVariable",
      "updateCustomVariable",
      "deleteCustomVariable",
      "setCustomVariables"
    ]),

    isDuplicateName(name) {
      if (!name) return false;
      const lower = name.toLowerCase();
      return this.variablesList.some(v => v.name && v.name.toLowerCase() === lower);
    },

    async saveVariable() {
      if (this.readOnly) return;
      if (this.$refs.variableForm && typeof this.$refs.variableForm.validate === "function") {
        const valid = await this.$refs.variableForm.validate();
        if (!valid) return;
      }

      const variableData = {
        name: this.form.name.trim(),
        value: Number(this.form.value),
        unit: (this.form.unit || "").trim(),
        description: (this.form.description || "").trim()
      };

      if (this.isEditing) {
        await this.updateCustomVariable({
          modelId: this.modelId,
          variableName: this.editingName,
          updates: variableData
        });
      } else {
        await this.addCustomVariable({
          modelId: this.modelId,
          variable: variableData
        });
      }

      this.cancelEditing();
    },

    startEditing(row) {
      this.isEditing = true;
      this.editingName = row.name;
      this.form = {
        name: row.name,
        value: row.value,
        unit: row.unit || "",
        description: row.description || ""
      };
    },

    cancelEditing() {
      this.isEditing = false;
      this.editingName = "";
      this.form = {
        name: "",
        value: null,
        unit: "",
        description: ""
      };
      if (this.$refs.variableForm) {
        this.$refs.variableForm.resetValidation();
      }
    },

    confirmDelete(variableName) {
      if (this.readOnly) return;
      this.deleteCustomVariable({
        modelId: this.modelId,
        variableName
      });
    },

    copySnippet(text) {
      if (typeof copyToClipboard === "function") {
        copyToClipboard(text);
      }
      if (typeof Notify !== "undefined" && Notify.create) {
        Notify.create({
          message: `${text} copied to clipboard`,
          color: "positive",
          icon: "content_copy",
          timeout: 1500
        });
      }
    }
  }
};
</script>

<style scoped>
.font-mono {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
