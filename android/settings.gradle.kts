pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "school-notes"
include(":app")
// include(":core-model")
// include(":ink-engine")
// include(":touch-engine")
// include(":document-engine")
// include(":storage")
// include(":remote")
