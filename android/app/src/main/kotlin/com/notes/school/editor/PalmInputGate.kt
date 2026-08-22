package com.notes.school.editor

import android.view.MotionEvent
import com.notes.school.core.PalmProfile
import com.notes.school.core.ThresholdKey
import com.notes.school.ink.InkView
import com.notes.school.ink.PointerVerdict
import com.notes.school.touch.Classification
import com.notes.school.touch.ContactClassifier
import com.notes.school.touch.ContactSample
import com.notes.school.touch.PointerState
import com.notes.school.touch.ProfileTuner

/** What the editor's crossed-out-hand indicator shows. */
enum class PalmStatus { IDLE, PEN_ACTIVE, PALM_REJECTED, LOW_CONFIDENCE }

/** Copies every numeric signal the classifier needs. No coordinates leave this process. */
fun MotionEvent.toContactSample(pointerIndex: Int): ContactSample = ContactSample(
    pointerId = getPointerId(pointerIndex),
    eventTimeMs = eventTime,
    x = getX(pointerIndex),
    y = getY(pointerIndex),
    toolType = getToolType(pointerIndex),
    pressure = getPressure(pointerIndex),
    size = getSize(pointerIndex),
    touchMajor = getTouchMajor(pointerIndex),
    touchMinor = getTouchMinor(pointerIndex),
    orientation = getOrientation(pointerIndex),
    pointerCount = pointerCount
)

/**
 * Bridges MotionEvents to the touch engine and the engine's verdicts back to [InkView].
 *
 * [scheduleDecision] is injected so the bounded decision window can be driven by a real
 * Handler in the app and by the test directly in unit tests.
 */
class PalmInputGate(
    private val view: InkView,
    private val classifier: ContactClassifier,
    private val tuner: ProfileTuner?,
    private val scheduleDecision: (delayMs: Long, action: () -> Unit) -> Unit
) {
    var onStatusChanged: ((PalmStatus) -> Unit)? = null

    private val verdicts = HashMap<Int, PointerVerdict>()
    private val awaitingDecision = HashSet<Int>()

    fun install() {
        view.pointerGate = { event, pointerIndex ->
            verdicts[event.getPointerId(pointerIndex)] ?: PointerVerdict.PROVISIONAL
        }
    }

    /**
     * Must run before the event reaches the view, so a verdict exists by the time
     * InkView asks for it.
     */
    fun onTouchEventPreDispatch(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                classify(event, event.actionIndex, isDown = true)
            }
            MotionEvent.ACTION_MOVE -> {
                for (index in 0 until event.pointerCount) classify(event, index, isDown = false)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                finish(event.getPointerId(event.actionIndex))
            }
            MotionEvent.ACTION_CANCEL -> {
                verdicts.keys.toList().forEach { finish(it) }
                classifier.reset()
            }
        }
    }

    /** Applies accumulated learning after the user leaves the document. Never mid-stroke. */
    fun endDocumentSession(nowMs: Long): PalmProfile? {
        val candidate = tuner?.endSession(nowMs) ?: return null
        classifier.updateProfile(candidate)
        return candidate
    }

    private fun classify(event: MotionEvent, pointerIndex: Int, isDown: Boolean) {
        val sample = event.toContactSample(pointerIndex)
        val result = classifier.onSample(sample)
        applyVerdict(result)
        if (isDown && verdicts[result.pointerId] == PointerVerdict.PROVISIONAL) {
            scheduleWindow(result.pointerId)
        }
    }

    private fun applyVerdict(result: Classification) {
        val previous = verdicts[result.pointerId]
        val verdict = when (result.state) {
            PointerState.PEN_LOCKED -> PointerVerdict.ACCEPT
            PointerState.PALM_LOCKED -> PointerVerdict.REJECT
            else -> PointerVerdict.PROVISIONAL
        }
        verdicts[result.pointerId] = verdict
        if (previous == verdict) return

        when (verdict) {
            PointerVerdict.ACCEPT -> {
                if (previous == PointerVerdict.PROVISIONAL) view.promoteProvisional(result.pointerId)
                onStatusChanged?.invoke(PalmStatus.PEN_ACTIVE)
            }
            PointerVerdict.REJECT -> {
                if (previous == PointerVerdict.PROVISIONAL) view.discardProvisional(result.pointerId)
                onStatusChanged?.invoke(PalmStatus.PALM_REJECTED)
            }
            PointerVerdict.PROVISIONAL -> Unit
        }
    }

    private fun scheduleWindow(pointerId: Int) {
        if (!awaitingDecision.add(pointerId)) return
        val windowMs = classifier.profile.thresholds[ThresholdKey.DECISION_WINDOW_MS].toLong()
        scheduleDecision(windowMs) {
            awaitingDecision -= pointerId
            if (verdicts[pointerId] != PointerVerdict.PROVISIONAL) return@scheduleDecision
            val decided = classifier.forceDecision(pointerId)
            if (decided == null) {
                onStatusChanged?.invoke(PalmStatus.LOW_CONFIDENCE)
                return@scheduleDecision
            }
            applyVerdict(decided)
        }
    }

    private fun finish(pointerId: Int) {
        classifier.onLift(pointerId)?.let { tuner?.observe(it) }
        verdicts -= pointerId
        awaitingDecision -= pointerId
        if (verdicts.isEmpty()) onStatusChanged?.invoke(PalmStatus.IDLE)
    }
}
