<template>
  <q-page padding>
    <div class="members-page">
      <div class="text-h5">{{ $t("Members") }}</div>
      <div v-if="currentOrg" class="text-subtitle1 text-grey-8 q-mb-md">{{ currentOrg.name }}</div>

      <!-- Workspace Tier & Seat Capacity Meter -->
      <q-card flat bordered class="q-mb-lg bg-grey-1" data-test="seat-usage-card">
        <q-card-section class="q-pb-sm">
          <div class="row items-center justify-between no-wrap">
            <div class="row items-center q-gutter-sm">
              <q-avatar size="36px" color="blue-1" text-color="primary" icon="workspace_premium" />
              <div>
                <div class="text-subtitle1 text-weight-bold row items-center q-gutter-xs">
                  <span>{{ tierDisplayTitle }}</span>
                  <q-badge
                    :color="currentOrg && currentOrg.subscriptionStatus === 'active' ? 'positive' : 'grey-7'"
                    class="q-ml-xs text-caption"
                  >
                    {{ currentOrg && currentOrg.subscriptionStatus === 'active' ? $t("statusActive") : $t("tierCommunity") }}
                  </q-badge>
                </div>
                <div class="text-caption text-grey-8">
                  {{ seatsUsageText }}
                </div>
              </div>
            </div>

            <div class="row items-center q-gutter-xs">
              <q-btn
                v-if="isAdmin && currentOrg && currentOrg.customerPortalUrl"
                flat
                dense
                no-caps
                color="primary"
                icon="credit_card"
                :label="$t('manageBilling')"
                :href="currentOrg.customerPortalUrl"
                target="_blank"
                rel="noopener"
              />
              <q-btn
                v-if="isAdmin && tierKey !== 'enterprise'"
                unelevated
                dense
                no-caps
                color="primary"
                class="q-px-sm"
                icon="upgrade"
                :label="$t('upgradeTier')"
                :loading="upgrading"
                @click="onUpgradeClick"
              />
            </div>
          </div>
        </q-card-section>

        <q-card-section class="q-pt-none q-pb-sm">
          <q-linear-progress
            :value="seatUsageRatio"
            :color="seatMeterColor"
            size="8px"
            rounded
            class="q-my-xs"
          />
          <div class="row items-center justify-between text-caption text-grey-7 q-mt-xs">
            <span>{{ $t("membersAndInvitesCount", { members: currentOrgUsers.length, invites: orgInvitations.length }) }}</span>
            <span class="text-caption text-primary">
              <q-icon name="visibility" size="14px" class="q-mr-xs" />
              {{ $t("freeStakeholderViewersNotice") }}
            </span>
          </div>
        </q-card-section>
      </q-card>

      <!-- Member Invitation Section (Admins only) -->
      <q-card v-if="isAdmin" flat bordered class="q-mb-lg">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("Invite someone") }}</div>
          <div class="text-body2 text-grey-8">{{ $t("inviteHelp") }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-banner v-if="isSeatFull" dense rounded class="bg-amber-1 text-grey-9 q-mb-md text-caption">
            <template v-slot:avatar>
              <q-icon name="warning" color="warning" />
            </template>
            {{ $t("seatLimitReachedNotice", { limit: seatLimit }) }}
          </q-banner>

          <q-form @submit.prevent="invite" class="row q-col-gutter-sm items-start">
            <q-input
              v-model="inviteEmail"
              ref="inviteEmail"
              class="col-12 col-sm"
              outlined
              dense
              type="email"
              :label="$t('Email')"
              lazy-rules
              :disable="isSeatFull"
              :rules="[(val) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val || '') || $t('Please enter a valid email address.')]"
            />
            <q-select
              v-model="inviteRole"
              class="col-6 col-sm-3"
              outlined
              dense
              emit-value
              map-options
              :options="roleOptions"
              :label="$t('Role')"
              :disable="isSeatFull"
            >
              <template v-slot:append>
                <q-icon name="info_outline" class="cursor-pointer" size="18px">
                  <q-tooltip max-width="280px">
                    {{ inviteRole === 'admin' ? $t('roleAdminDesc') : $t('roleMemberDesc') }}
                  </q-tooltip>
                </q-icon>
              </template>
            </q-select>
            <div class="col-6 col-sm-auto">
              <q-btn
                type="submit"
                unelevated
                no-caps
                color="primary"
                icon="send"
                :label="$t('Invite')"
                :loading="inviting"
                :disable="isSeatFull"
              />
            </div>
          </q-form>
        </q-card-section>

        <template v-if="orgInvitations.length">
          <q-separator />
          <q-list dense>
            <q-item-label header>{{ $t("Waiting for a reply") }}</q-item-label>
            <q-item v-for="invitation in orgInvitations" :key="invitation.id">
              <q-item-section avatar><q-icon name="schedule" color="grey" /></q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ invitation.email }}</q-item-label>
                <div class="row items-center q-gutter-xs q-mt-xs">
                  <q-chip
                    dense
                    size="xs"
                    :color="invitation.role === 'admin' ? 'primary' : 'grey-7'"
                    text-color="white"
                  >
                    {{ $t(roleLabel(invitation.role)) }}
                    <q-tooltip max-width="280px">
                      {{ invitation.role === 'admin' ? $t('roleAdminTooltip') : $t('roleMemberTooltip') }}
                    </q-tooltip>
                  </q-chip>
                </div>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center q-gutter-xs">
                  <q-btn
                    flat
                    no-caps
                    dense
                    color="primary"
                    icon="send"
                    :label="$t('resendInvitation')"
                    :loading="resendingId === invitation.id"
                    @click="resend(invitation)"
                  >
                    <q-tooltip>{{ $t("resendInvitation") }}</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    no-caps
                    dense
                    color="grey-7"
                    :label="$t('Withdraw')"
                    @click="deleteInvitation({ orgId, invitationId: invitation.id })"
                  />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card>

      <!-- Active Members List -->
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="member in sortedMembers" :key="member.id">
          <q-item-section avatar>
            <q-avatar color="blue-1" text-color="primary">{{ initial(member) }}</q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label>
              {{ member.displayName || member.email }}
              <span v-if="member.id == userId" class="text-grey-7">({{ $t("you") }})</span>
            </q-item-label>
            <q-item-label caption>{{ member.email }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center q-gutter-sm no-wrap">
              <q-chip
                v-if="adminIds.includes(member.id)"
                dense
                color="primary"
                text-color="white"
                class="cursor-pointer"
              >
                {{ $t("Admin") }}
                <q-tooltip max-width="280px">{{ $t("roleAdminTooltip") }}</q-tooltip>
              </q-chip>
              <q-chip
                v-else
                dense
                outline
                color="grey-7"
                class="cursor-pointer"
              >
                {{ $t("Member") }}
                <q-tooltip max-width="280px">{{ $t("roleMemberTooltip") }}</q-tooltip>
              </q-chip>
              <q-btn v-if="isAdmin || member.id == userId" flat round dense icon="more_vert" :aria-label="$t('Member options')">
                <q-menu auto-close>
                  <q-list style="min-width: 200px">
                    <template v-if="isAdmin">
                      <q-item v-if="!adminIds.includes(member.id)" clickable @click="setRole(member, 'admin')">
                        <q-item-section>{{ $t("Make admin") }}</q-item-section>
                      </q-item>
                      <q-item v-else clickable @click="setRole(member, 'member')">
                        <q-item-section>{{ $t("Remove admin role") }}</q-item-section>
                      </q-item>
                    </template>
                    <q-item clickable @click="remove(member)">
                      <q-item-section class="text-negative">
                        {{ member.id == userId ? $t("Leave organization") : $t("Remove from organization") }}
                      </q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<script>
import { mapState, mapGetters, mapActions } from "vuex";
import { requestCheckoutUrl } from "@/utils/billing";

export default {
  data() {
    return {
      inviteEmail: "",
      inviteRole: "member",
      inviting: false,
      upgrading: false,
      resendingId: null
    };
  },
  computed: {
    ...mapState("auth", ["userId"]),
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("members", ["orgInvitations"]),
    ...mapGetters("users", ["currentOrgUsers"]),
    orgId() {
      return this.$route.params.orgId;
    },
    adminIds() {
      return this.currentOrg ? this.currentOrg.superAdmins || [] : [];
    },
    isAdmin() {
      return this.adminIds.includes(this.userId);
    },
    seatLimit() {
      return (this.currentOrg && Number(this.currentOrg.seatLimit)) || 1;
    },
    tierKey() {
      return (this.currentOrg && this.currentOrg.subscriptionTier) || "community";
    },
    tierDisplayTitle() {
      const titles = {
        community: this.$t("tierCommunity"),
        starter: this.$t("tierStarter"),
        growth: this.$t("tierGrowth"),
        pro: this.$t("tierPro"),
        enterprise: this.$t("tierEnterprise")
      };
      return titles[this.tierKey] || this.$t("tierCommunity");
    },
    totalCommittedSeats() {
      const activeCount = (this.currentOrgUsers && this.currentOrgUsers.length) || 0;
      const inviteCount = (this.orgInvitations && this.orgInvitations.length) || 0;
      return activeCount + inviteCount;
    },
    seatsUsageText() {
      return this.$t("seatUsageCounter", {
        used: this.totalCommittedSeats,
        limit: this.seatLimit
      });
    },
    seatUsageRatio() {
      if (!this.seatLimit) return 1;
      return Math.min(1, this.totalCommittedSeats / this.seatLimit);
    },
    seatMeterColor() {
      if (this.seatUsageRatio >= 1) return "negative";
      if (this.seatUsageRatio >= 0.8) return "warning";
      return "positive";
    },
    isSeatFull() {
      return this.totalCommittedSeats >= this.seatLimit;
    },
    roleOptions() {
      return [
        { value: "member", label: this.$t("Member") },
        { value: "admin", label: this.$t("Admin") }
      ];
    },
    sortedMembers() {
      return [...this.currentOrgUsers].sort((a, b) =>
        (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")
      );
    }
  },
  methods: {
    ...mapActions("members", [
      "inviteMember",
      "deleteInvitation",
      "resendInvitation",
      "removeMember",
      "setMemberRole",
      "bindOrgInvitations",
      "unbindOrgInvitations"
    ]),
    async onUpgradeClick() {
      this.upgrading = true;
      try {
        const nextTier = this.tierKey === "community" ? "starter" : this.tierKey === "starter" ? "growth" : "pro";
        const result = await requestCheckoutUrl({
          orgId: this.orgId,
          tier: nextTier,
          billingCycle: "monthly"
        });
        if (result && result.checkoutUrl) {
          window.open(result.checkoutUrl, "_blank");
        }
      } catch (err) {
        console.error("Upgrade checkout error:", err);
        this.$q.notify({
          type: "negative",
          message: err.message || this.$t("Something went wrong")
        });
      } finally {
        this.upgrading = false;
      }
    },
    async resend(invitation) {
      this.resendingId = invitation.id;
      await this.resendInvitation({
        orgId: this.orgId,
        invitationId: invitation.id,
        email: invitation.email
      });
      this.resendingId = null;
    },
    roleLabel(role) {
      return role == "admin" ? "Admin" : "Member";
    },
    initial(member) {
      return (member.displayName || member.email || "?").charAt(0).toUpperCase();
    },
    async invite() {
      if (!(await this.$refs.inviteEmail.validate())) return;
      const email = this.inviteEmail.trim().toLowerCase();
      if (this.currentOrgUsers.some((m) => (m.email || "").toLowerCase() == email)) {
        this.$q.notify(this.$t("alreadyMember"));
        return;
      }
      this.inviting = true;
      const ok = await this.inviteMember({ org: this.currentOrg, email, role: this.inviteRole });
      this.inviting = false;
      if (ok) {
        this.inviteEmail = "";
        this.$refs.inviteEmail.resetValidation();
      }
    },
    setRole(member, role) {
      this.setMemberRole({ orgId: this.orgId, memberId: member.id, role });
    },
    remove(member) {
      const leaving = member.id == this.userId;
      this.$q
        .dialog({
          title: leaving ? this.$t("Leave organization") : this.$t("Remove from organization"),
          message: leaving
            ? this.$t("leaveConfirm", { name: this.currentOrg.name })
            : this.$t("removeConfirm", { name: member.displayName || member.email }),
          cancel: true
        })
        .onOk(async () => {
          const ok = await this.removeMember({ orgId: this.orgId, memberId: member.id });
          if (ok && leaving) this.$router.push("/");
        });
    }
  },
  watch: {
    isAdmin: {
      immediate: true,
      handler(isAdmin) {
        if (isAdmin) this.bindOrgInvitations(this.orgId);
      }
    }
  },
  beforeUnmount() {
    this.unbindOrgInvitations();
  }
};
</script>

<style scoped>
.members-page {
  max-width: 760px;
  margin: 0 auto;
}
</style>
