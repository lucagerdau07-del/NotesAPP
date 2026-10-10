package com.notes.school.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.notes.school.ui.editor.EditorRoute
import com.notes.school.ui.files.FilesRoute
import com.notes.school.ui.settings.CalibrationRoute
import com.notes.school.ui.settings.PalmAdvancedRoute
import com.notes.school.ui.settings.SettingsRoute
import com.notes.school.ui.theme.GlassSettings
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.NotesTheme

@Composable
fun NotesApp(
    navController: NavHostController = rememberNavController(),
    glass: GlassSettings = GlassSettings()
) {
    NotesTheme(glass = glass) {
        Surface(color = NotesColors.Workspace, modifier = Modifier.fillMaxSize()) {
            Box {
                NavHost(navController = navController, startDestination = Destinations.FILES) {
                    composable(Destinations.FILES) {
                        FilesRoute(
                            onOpenDocument = { navController.navigate(Destinations.editor(it)) },
                            onOpenSettings = { navController.navigate(Destinations.SETTINGS) }
                        )
                    }
                    composable(
                        Destinations.EDITOR,
                        arguments = listOf(navArgument("documentId") { type = NavType.StringType })
                    ) { entry ->
                        EditorRoute(
                            documentId = entry.arguments?.getString("documentId").orEmpty(),
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable(Destinations.SETTINGS) {
                        SettingsRoute(
                            onBack = { navController.popBackStack() },
                            onOpenAdvanced = { navController.navigate(Destinations.PALM_ADVANCED) },
                            onRecalibrate = { navController.navigate(Destinations.CALIBRATION) }
                        )
                    }
                    composable(Destinations.PALM_ADVANCED) {
                        PalmAdvancedRoute(onBack = { navController.popBackStack() })
                    }
                    composable(Destinations.CALIBRATION) {
                        CalibrationRoute(onDone = { navController.popBackStack() })
                    }
                }
            }
        }
    }
}
