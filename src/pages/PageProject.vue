<template>
  <q-page class="project-page">
    <section class="project-container q-py-xl q-px-md">
      <img
        :src="'/collective-change/collective-change-symbol.svg'"
        :alt="$t('projectTitle')"
        class="project-mark q-mb-lg"
        data-testid="project-mark"
      />
      <h1 class="text-h3 text-weight-bolder text-grey-9 q-mt-none q-mb-lg" data-testid="project-title">
        {{ $t("projectTitle") }}
      </h1>

      <p class="text-h6 text-grey-9 text-weight-regular">{{ $t("projectP1") }}</p>
      <p class="text-h6 text-grey-9 text-weight-regular">{{ $t("projectP2") }}</p>
      <p class="text-h6 text-grey-9 text-weight-regular">{{ $t("projectP3") }}</p>

      <p class="text-body1 q-mt-lg" data-testid="project-longecho">
        <strong>{{ $t("projectLongechoName") }}</strong>{{ $t("projectLongechoMid") }}<strong>{{ $t("projectLongechoStrong") }}</strong>{{ $t("projectLongechoTail") }}
      </p>

      <h2 class="text-h6 text-weight-bold q-mt-lg q-mb-sm">{{ $t("projectGetHeading") }}</h2>
      <ul class="project-list text-body1">
        <li v-for="n in 4" :key="n" :data-testid="`project-bullet-${n}`">
          <strong>{{ $t(`projectBullet${n}Lead`) }}</strong> {{ $t(`projectBullet${n}Body`) }}
        </li>
      </ul>

      <p class="text-body1 q-mt-lg">
        <strong>{{ $t("projectComeAndSee") }}</strong>
        →
        <a href="https://longecho.app" rel="noopener" data-testid="project-longecho-link">longecho.app</a>
      </p>

      <p class="text-body2 text-grey-8 q-mt-lg"><em>{{ $t("projectAside") }}</em></p>

      <p class="text-body2 text-grey-8 q-mt-xl" data-testid="project-byline">
        {{ $t("projectBuiltByPrefix") }}<strong>Ted Hwang</strong>{{ $t("projectBuiltBySuffix") }}
        <a href="mailto:hello@collective-change.org">hello@collective-change.org</a>
      </p>
    </section>
  </q-page>
</template>

<script>
export default {
  name: "PageProject"
};
</script>

<style scoped>
.project-container {
  max-width: 720px;
  margin: 0 auto;
}
.project-mark {
  width: 88px;
  height: 88px;
  display: block;
}
.project-list li {
  margin-bottom: 0.75rem;
}
</style>
