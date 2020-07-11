<template>
  <div>
    <div v-if="selectedIssue">
      <q-form @submit.prevent="submitForm">
        <div class="row">
          <div v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }">
            <q-input
              class="text-h6"
              v-model="title"
              :rules="[val => !!val || 'Field is required']"
              ref="issueTitle"
            >
              <template v-slot:after v-if="embedded">
                <q-btn
                  dense
                  label="details"
                  color="primary"
                  @click="
                    $router.push(
                      `/org/${currentOrg.name}/issue/${currentOrg.id}/${selectedIssueId}`
                    )
                  "
                />
              </template>
            </q-input>
          </div>

          <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-6': embedded }">
            <div class="q-pa-xs q-gutter-xs">
              <q-chip outline color="primary">
                Total benefit
                {{ uiIssue.estTotalBenefitXdr.toLocaleString() }} XDR
              </q-chip>
              <q-chip outline color="primary">
                Outstanding cost
                {{
                parseFloat(
                uiIssue.outstandingCostXdr.toPrecision(3)
                ).toLocaleString()
                }}
                XDR
              </q-chip>
              <q-chip color="primary" text-color="white">
                actionRoi
                {{
                parseFloat(uiIssue.estRoi.toPrecision(2)).toLocaleString()
                }}
              </q-chip>
            </div>
          </div>

          <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-6': embedded }">
            <div class="q-pa-sm q-gutter-sm">
              <q-btn color="primary" label="Meet about this" />
              <q-btn color="primary" label="Mark as resolved" />
            </div>
          </div>
        </div>

        <div class="row">
          <div v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }">
            <q-input v-model="notes" label="筆記" filled autogrow />

            <div class="text-h6">Impacts</div>
            <q-list bordered padding>
              <q-item tag="label" v-ripple>
                <q-item-section>
                  <q-item-label>Battery too low</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <!--<q-toggle color="blue" v-model="notif1" val="battery" />-->
                </q-item-section>
              </q-item>
            </q-list>

            <div class="row q-gutter-md q-mt-md items-start">
              <q-input
                v-model.number="estTotalBenefitXdr"
                label="預估總效益"
                type="number"
                suffix="XDR"
                filled
                style="max-width: 150px;"
                debounce="500"
              />

              <q-input
                v-bind:value="uiIssue.estTotalCostXdr"
                label="預估總成本"
                type="number"
                suffix="XDR"
                style="max-width: 150px;"
                readonly
              />

              <q-input
                v-bind:value="
                  parseFloat(uiIssue.outstandingCostXdr.toPrecision(3))
                "
                label="需再付出成本"
                type="number"
                suffix="XDR"
                style="max-width: 150px;"
                readonly
              />

              <q-input
                v-bind:value="parseFloat(uiIssue.estRoi.toPrecision(2))"
                label="估計 SROI"
                type="number"
                style="max-width: 150px;"
                readonly
              />
            </div>

            <div class="row q-gutter-md q-mt-md items-start">
              <q-input
                v-model.number="estEffortCostXdr"
                label="預估人力成本"
                type="number"
                suffix="XDR"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-input
                v-model.number="effortCompletionPercentage"
                type="number"
                suffix="% 完成"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-slider
                :value="effortCompletionPercentage"
                @change="
                  val => {
                    effortCompletionPercentage = val;
                  }
                "
                :min="0"
                :max="100"
                label
              />
            </div>

            <div class="q-gutter-md q-mt-md row items-start">
              <q-input
                v-model.number="estSpending"
                label="預估採購金額"
                type="number"
                suffix="XDR"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
              <q-input
                v-model.number="spentAmount"
                label="已採購金額"
                type="number"
                suffix="XDR"
                :rules="[
                  val => val == null || val >= 0 || 'Should be at least 0'
                ]"
                filled
                style="max-width: 150px;"
                debounce="500"
              />
            </div>
            <div class="q-gutter-md q-mt-md items-start">
              <q-input
                v-model="dueDate"
                filled
                type="date"
                label="截止日期"
                style="max-width: 160px;"
                debounce="500"
              />
            </div>

            <modal-buttons />
          </div>
          <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">middle column</div>
          <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">right column</div>
        </div>
      </q-form>
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex";
//import { mapFields } from 'vuex-map-fields';
import { createHelpers } from "vuex-map-fields";

const { mapFields } = createHelpers({
  getterType: "uiIssue/getField",
  mutationType: "uiIssue/updateUiIssueField"
});

export default {
  components: {
    "modal-buttons": require("components/Shared/ModalComponents/ModalButtons.vue")
      .default
  },

  data() {
    return {
      embedded: false, //whether this component is embedded or a full page
      issueId: null,
      //issue: {},
      estimatedRoi: null
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedIssueId"]),
    ...mapState("issues", ["issues"]),
    //fields calculated in the uiIssue store, for display only
    //(do not modify their values in the component)
    ...mapState("uiIssue", ["uiIssue"]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiIssue.title",
      "uiIssue.estTotalBenefitXdr",
      "uiIssue.estEffortCostXdr",
      "uiIssue.effortCompletionPercentage",
      "uiIssue.estSpending",
      "uiIssue.spentAmount",
      "uiIssue.dueDate",
      "uiIssue.notes"
    ]),

    selectedIssue() {
      let that = this;
      if (this.$route.params.issueId) {
        this.issueId = this.$route.params.issueId;
        this.embedded = false;
      } else if (that.selectedIssueId) {
        this.issueId = that.selectedIssueId;
        this.embedded = true;
      }
      let issueId = this.issueId;
      return this.issues.find(function(issue) {
        return issue.id == issueId;
      });
    }
  },

  methods: {
    ...mapActions("model", ["updateIssue"]),
    submitForm() {
      this.$refs.issueTitle.validate();
      if (!this.$refs.issueTitle.hasError) {
        this.submitIssue();
      }
    },
    submitIssue() {
      let payload = {
        id: this.issueId,
        updates: this.uiIssue
      };
      this.$store.dispatch("issues/updateIssue", payload);
    }
  },

  watch: {
    selectedIssue: function(newIssue, oldIssue) {
      this.$store.dispatch("uiIssue/setUiIssue", this.selectedIssue);
    }
  }
};
</script>
