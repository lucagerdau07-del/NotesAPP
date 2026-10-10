package com.notes.school.ui.editor

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import com.notes.school.core.Stroke
import com.notes.school.editor.PalmInputGate
import com.notes.school.ink.InkScene
import com.notes.school.ink.InkView
import com.notes.school.ink.ToolSettings

/**
 * The only bridge between Compose and the drawing path. Tool changes are pushed into the
 * view imperatively in [AndroidView.update]; touch samples never travel back through
 * Compose state, which is what keeps recomposition out of the hot path.
 */
@Composable
fun InkSurface(
    scene: InkScene,
    tool: ToolSettings,
    onStrokeCommitted: (Stroke) -> Unit,
    modifier: Modifier = Modifier,
    gateFactory: ((InkView) -> PalmInputGate)? = null
) {
    AndroidView(
        modifier = modifier.testTag("ink-surface"),
        factory = { context ->
            InkView(context).apply {
                this.scene = scene
                this.tool = tool
                this.onStrokeCommitted = onStrokeCommitted
                gateFactory?.invoke(this)?.install()
            }
        },
        update = { view ->
            view.scene = scene
            view.tool = tool
            view.onStrokeCommitted = onStrokeCommitted
        }
    )
}
