package com.notes.school.ui

object Destinations {
    const val FILES = "files"
    const val EDITOR = "editor/{documentId}"
    const val SETTINGS = "settings"
    const val PALM_ADVANCED = "settings/palm/advanced"
    const val CALIBRATION = "settings/palm/calibration"

    fun editor(documentId: String): String = "editor/$documentId"
}
