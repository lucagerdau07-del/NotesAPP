package com.notes.school.document

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import com.notes.school.core.DocumentKind

/**
 * Paper is the content layer: the page stays white while the rest of the app is dark.
 * Templates are drawn, never bitmap assets, so they stay crisp at any zoom.
 */
object PaperTemplate {

    val PAGE_COLOR: Int = Color.WHITE
    val RULE_COLOR: Int = Color.argb(255, 200, 209, 219)

    /** Roughly 9 mm at 150 dpi, the spacing of a German college-ruled block. */
    const val LINE_SPACING_PX: Float = 53f
    /** Roughly 5 mm at 150 dpi. */
    const val GRID_SPACING_PX: Float = 30f
    const val MARGIN_PX: Float = 90f

    private val background = Paint().apply { color = PAGE_COLOR }
    private val rule = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = RULE_COLOR
        strokeWidth = 1.2f
        style = Paint.Style.STROKE
    }

    fun draw(canvas: Canvas, kind: DocumentKind, widthPx: Float, heightPx: Float) {
        canvas.drawRect(0f, 0f, maxOf(widthPx, 1f), maxOf(heightPx, 1f), background)
        if (widthPx <= 0f || heightPx <= 0f) return
        when (kind) {
            DocumentKind.LINED -> {
                var y = LINE_SPACING_PX
                while (y < heightPx) {
                    canvas.drawLine(MARGIN_PX, y, widthPx - MARGIN_PX / 2f, y, rule)
                    y += LINE_SPACING_PX
                }
            }
            DocumentKind.GRID -> {
                var y = GRID_SPACING_PX
                while (y < heightPx) {
                    canvas.drawLine(0f, y, widthPx, y, rule)
                    y += GRID_SPACING_PX
                }
                var x = GRID_SPACING_PX
                while (x < widthPx) {
                    canvas.drawLine(x, 0f, x, heightPx, rule)
                    x += GRID_SPACING_PX
                }
            }
            // A PDF page supplies its own content; drawing rules over it would be vandalism.
            DocumentKind.BLANK, DocumentKind.PDF -> Unit
        }
    }
}
