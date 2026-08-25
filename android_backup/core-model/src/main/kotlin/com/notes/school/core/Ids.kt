package com.notes.school.core

import java.util.UUID

/** Stable, storage-safe identifier used for folders, documents, pages, strokes and jobs. */
fun newId(): String = UUID.randomUUID().toString()
