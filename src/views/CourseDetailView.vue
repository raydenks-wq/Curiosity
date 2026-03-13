<template>
  <div class="course-detail-view-root">
  <section v-if="currentTemplate === 'sunrise'" class="course-player-layout">
    <article class="card course-player-card">
      <div class="lesson-stage" :style="{ background: currentCourse?.gradient || fallbackGradient }">
        <p>{{ currentCourse?.title || 'Course' }}</p>
        <h2>{{ activeLesson?.title || 'Loading lesson...' }}</h2>
        <span>{{ activeLesson?.duration || '-' }} · {{ activeLesson?.type || 'lesson' }}</span>
      </div>

      <div class="lesson-content">
        <p v-if="pendingPlaybackSyncCount > 0" class="sync-queue-indicator" role="status" aria-live="polite">
          {{ pendingPlaybackSyncCount }} progress update menunggu sinkronisasi.
          <span v-if="failedPlaybackSyncCount > 0"> ({{ failedPlaybackSyncCount }} retry)</span>
        </p>
        <div class="tab-strip" role="tablist" aria-label="Lesson Sections">
          <button
            id="lesson-tab-material"
            class="tab"
            :class="{ active: activeTab === 'material' }"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'material'"
            aria-controls="lesson-panel-material"
            :tabindex="activeTab === 'material' ? 0 : -1"
            @click="activeTab = 'material'"
          >
            Materi
          </button>
          <button
            id="lesson-tab-resources"
            class="tab"
            :class="{ active: activeTab === 'resources' }"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'resources'"
            aria-controls="lesson-panel-resources"
            :tabindex="activeTab === 'resources' ? 0 : -1"
            @click="activeTab = 'resources'"
          >
            Resources
          </button>
          <button
            id="lesson-tab-discussion"
            class="tab"
            :class="{ active: activeTab === 'discussion' }"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'discussion'"
            aria-controls="lesson-panel-discussion"
            :tabindex="activeTab === 'discussion' ? 0 : -1"
            @click="activeTab = 'discussion'"
          >
            Discussion
          </button>
          <button
            id="lesson-tab-assignment"
            class="tab"
            :class="{ active: activeTab === 'assignment' }"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'assignment'"
            aria-controls="lesson-panel-assignment"
            :tabindex="activeTab === 'assignment' ? 0 : -1"
            @click="activeTab = 'assignment'"
          >
            Assignment
          </button>
        </div>

        <template v-if="activeTab === 'material'">
          <div id="lesson-panel-material" role="tabpanel" aria-labelledby="lesson-tab-material">
          <p class="lesson-summary">{{ activeLesson?.summary || 'Menyiapkan konten lesson...' }}</p>
          <div v-if="activeLesson?.type === 'video' && activeLesson?.videoUrl" class="video-player-shell">
            <video
              ref="lessonVideoRef"
              class="lesson-video-player"
              controls
              playsinline
              preload="metadata"
              :src="activeLesson.videoUrl"
              @loadstart="onVideoLoadStart"
              @play="onVideoPlay"
              @loadedmetadata="onVideoLoadedMetadata"
              @error="onVideoError"
              @timeupdate="onVideoTimeUpdate"
              @pause="onVideoPause"
              @ended="onVideoEnded"
            ></video>
            <div v-if="videoLoadErrorTitle" class="video-error-panel">
              <p class="video-error-title">{{ videoLoadErrorTitle }}</p>
              <p v-if="videoLoadErrorDetail" class="video-error-detail">{{ videoLoadErrorDetail }}</p>
              <button class="ghost-btn video-error-action" type="button" @click="openVideoSourceInNewTab">Open video URL</button>
            </div>
            <div class="video-player-meta">
              <span>Resume {{ formatSeconds(displayVideoResumeSec) }}</span>
              <strong>{{ displayVideoProgressPercent }}% watched</strong>
            </div>
            <label class="video-auto-complete-toggle">
              <input v-model="autoCompleteVideoEnabled" type="checkbox" />
              <span>Auto complete saat capai target</span>
            </label>
          </div>
          <article v-else-if="activeLesson?.type === 'article'" class="lesson-type-panel">
            <h4>Article Lesson</h4>
            <p class="muted">Baca materi artikel dan lanjutkan ke lesson berikutnya saat selesai.</p>
            <p v-if="activeLesson.articleContent" class="lesson-article-content">{{ activeLesson.articleContent }}</p>
            <div class="table-actions">
              <a v-if="activeLesson.articleReferenceUrl" class="ghost-btn" :href="activeLesson.articleReferenceUrl" target="_blank" rel="noopener noreferrer">Open Reference</a>
              <button
                v-if="activeLesson.articleAttachmentId || activeLesson.articleAttachmentDataUrl || activeLesson.articleAttachmentUrl"
                class="ghost-btn"
                type="button"
                @click="downloadActiveLessonArticleAttachment"
              >
                Download Attachment
              </button>
            </div>
          </article>
          <article v-else-if="activeLesson?.type === 'quiz'" class="lesson-type-panel">
            <h4>Quiz Lesson</h4>
            <p class="muted">Lesson ini terhubung ke quiz engine yang sudah ada.</p>
            <p class="muted"><strong>Quiz ID:</strong> {{ activeLesson.quizId || '-' }}</p>
            <div class="table-actions">
              <RouterLink v-if="activeLesson.quizId" class="primary-btn" :to="toLessonQuizRoute(activeLesson.quizId)">Mulai Quiz</RouterLink>
              <RouterLink class="ghost-btn" :to="{ name: 'quiz-admin' }">Manage Quiz</RouterLink>
            </div>
          </article>
          <article v-else-if="activeLesson?.type === 'assignment'" class="lesson-type-panel">
            <h4>Assignment Lesson</h4>
            <p class="muted">{{ activeLesson.assignmentInstruction || 'Baca instruksi tugas lalu submit di tab Assignment.' }}</p>
            <p class="muted"><strong>Mode:</strong> {{ activeLesson.assignmentMode || 'file' }} · <strong>Due:</strong> {{ activeLesson.assignmentDueAt || '-' }}</p>
            <div class="table-actions">
              <button class="ghost-btn" type="button" @click="activeTab = 'assignment'">Open Assignment Tab</button>
            </div>
          </article>
          <article v-else-if="activeLesson?.type === 'live'" class="lesson-type-panel">
            <h4>Live Session</h4>
            <p class="muted"><strong>Start:</strong> {{ activeLesson.liveStartAt || '-' }} · <strong>Timezone:</strong> {{ activeLesson.liveTimezone || 'Asia/Jakarta' }}</p>
            <div class="table-actions">
              <a v-if="activeLesson.liveMeetingUrl" class="primary-btn" :href="activeLesson.liveMeetingUrl" target="_blank" rel="noopener noreferrer">Join Meeting</a>
            </div>
          </article>
          <div class="hero-actions">
            <button class="ghost-btn" type="button" :disabled="!previousLesson" @click="goPrevious">Previous</button>
            <button class="primary-btn" type="button" :disabled="isCompleting || !activeLesson || !canCompleteActiveLesson" @click="markComplete">
              {{ isCompleting ? 'Saving...' : 'Mark as Complete' }}
            </button>
            <button class="ghost-btn" type="button" :disabled="!nextLesson || nextLesson.isLocked" @click="goNext">Next</button>
          </div>
          <p v-if="activeLesson && !canCompleteActiveLesson" class="muted">
            {{ activeLessonCompletionHint }}
          </p>
          <div v-if="activeLesson?.type === 'video'" class="lesson-enhancement-grid">
            <section class="lesson-side-card">
              <div class="section-header">
                <h4>Bookmark & Notes</h4>
                <span class="muted">{{ lessonNotes.length }} catatan</span>
              </div>
              <p class="muted">Simpan poin penting berdasarkan timestamp video.</p>
              <div class="lesson-note-form">
                <label class="assignment-field">
                  <span>Timestamp</span>
                  <input
                    v-model="noteDraftTimestampInput"
                    class="assignment-input"
                    type="text"
                    inputmode="numeric"
                    placeholder="00:00"
                    aria-label="Note timestamp"
                  />
                </label>
                <label class="assignment-field">
                  <span>Catatan</span>
                  <textarea v-model="noteDraftText" class="assignment-input" rows="2" placeholder="Contoh: prinsip kontras untuk CTA" aria-label="Note content"></textarea>
                </label>
                <div class="hero-actions">
                  <button class="ghost-btn" type="button" :disabled="!lessonVideoRef" @click="setNoteTimestampFromCurrent">Use Current Time</button>
                  <button class="primary-btn" type="button" :disabled="notesStore.isSubmitting || !canSaveNoteDraft" @click="saveNoteDraft">
                    {{ notesStore.isSubmitting ? 'Saving...' : editingNoteId ? 'Update Note' : 'Add Note' }}
                  </button>
                  <button v-if="editingNoteId" class="ghost-btn" type="button" @click="cancelNoteEdit">Cancel</button>
                </div>
              </div>
              <p v-if="notesStore.isLoading" class="muted">Memuat catatan...</p>
              <ul v-else-if="lessonNotes.length" class="lesson-note-list">
                <li v-for="item in lessonNotes" :key="`sunrise-note-${item.id}`">
                  <button type="button" class="lesson-timestamp-btn" @click="seekToTimestamp(item.timestampSec)">
                    {{ formatSeconds(item.timestampSec) }}
                  </button>
                  <p>{{ item.note }}</p>
                  <div class="lesson-note-actions">
                    <button type="button" class="assignment-compare-btn" @click="startNoteEdit(item)">Edit</button>
                    <button type="button" class="assignment-compare-btn" @click="removeNote(item.id)">Delete</button>
                  </div>
                </li>
              </ul>
            </section>
            <section class="lesson-side-card">
              <div class="section-header">
                <h4>Transcript</h4>
                <span class="muted">{{ filteredTranscriptRows.length }} baris</span>
              </div>
              <input v-model="transcriptQuery" class="assignment-input" type="search" placeholder="Cari kata di transcript..." aria-label="Search transcript" />
              <ul v-if="filteredTranscriptRows.length" class="transcript-list">
                <li v-for="row in filteredTranscriptRows" :key="`sunrise-transcript-${row.id}`">
                  <button type="button" class="lesson-timestamp-btn" @click="seekToTimestamp(row.atSec)">{{ formatSeconds(row.atSec) }}</button>
                  <p>{{ row.text }}</p>
                </li>
              </ul>
              <p v-else class="muted">Transcript tidak ditemukan untuk kata kunci ini.</p>
            </section>
          </div>
          </div>
        </template>

        <template v-else-if="activeTab === 'resources'">
          <div id="lesson-panel-resources" role="tabpanel" aria-labelledby="lesson-tab-resources">
          <p class="lesson-summary">Resources untuk lesson ini.</p>
          <div class="lesson-resource-list">
            <article v-for="resource in activeLessonResources" :key="resource.id" class="lesson-resource-item">
              <div>
                <strong>{{ resource.title }}</strong>
                <p class="muted">{{ resource.fileName }} · {{ formatBytes(resource.sizeBytes) }}</p>
              </div>
              <button class="ghost-btn" type="button" :disabled="!resource.dataUrl" @click="downloadLessonResource(resource)">
                Download
              </button>
            </article>
          </div>
          </div>
        </template>

        <template v-else-if="activeTab === 'discussion'">
          <div id="lesson-panel-discussion" role="tabpanel" aria-labelledby="lesson-tab-discussion">
          <div class="discussion-composer">
            <p v-if="replyTarget" class="reply-indicator">
              Membalas {{ replyTarget.authorName }}
              <button type="button" @click="clearReplyTarget">Batal</button>
            </p>
            <textarea
              v-model="discussionDraft"
              class="discussion-input"
              placeholder="Tulis pertanyaan atau insight kamu..."
              rows="3"
            ></textarea>
            <ul v-if="mentionSuggestions.length" class="mention-suggestion-list">
              <li v-for="user in mentionSuggestions" :key="`sunrise-${user.id}`">
                <button type="button" @click="applyMention(user)">
                  <strong>@{{ user.handle }}</strong>
                  <span>{{ user.name }}</span>
                </button>
              </li>
            </ul>
            <div class="hero-actions">
              <button
                class="primary-btn"
                type="button"
                :disabled="discussionStore.isSubmitting || !discussionDraft.trim() || !activeLesson"
                @click="submitDiscussion"
              >
                {{ discussionStore.isSubmitting ? 'Mengirim...' : 'Kirim Komentar' }}
              </button>
            </div>
          </div>

          <p v-if="discussionStore.isLoading" class="muted">Memuat diskusi...</p>
          <ul v-else-if="threadedDiscussions.length" class="discussion-list">
            <li v-for="thread in threadedDiscussions" :key="thread.root.id" class="discussion-thread">
              <article
                class="discussion-item"
                :class="{ 'focus-target': focusDiscussionId === thread.root.id }"
                :data-discussion-id="thread.root.id"
              >
                <p class="discussion-meta">{{ thread.root.authorName }} · {{ formatDiscussionTime(thread.root.createdAt) }}</p>
                <template v-if="editingItemId === thread.root.id">
                  <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="saveEdit(thread.root)">Save</button>
                    <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <p class="discussion-message">{{ thread.root.message }}</p>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="setReplyTarget(thread.root)">Reply</button>
                    <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn" @click="startEdit(thread.root)">
                      Edit
                    </button>
                    <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(thread.root)">
                      Delete
                    </button>
                  </div>
                </template>
              </article>
              <ul v-if="thread.replies.length" class="discussion-reply-list">
                <li
                  v-for="reply in thread.replies"
                  :key="reply.id"
                  class="discussion-item discussion-item-reply"
                  :class="{ 'focus-target': focusDiscussionId === reply.id }"
                  :data-discussion-id="reply.id"
                >
                  <p class="discussion-meta">{{ reply.authorName }} · {{ formatDiscussionTime(reply.createdAt) }}</p>
                  <template v-if="editingItemId === reply.id">
                    <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                    <div class="discussion-actions">
                      <button type="button" class="discussion-reply-btn" @click="saveEdit(reply)">Save</button>
                      <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                    </div>
                  </template>
                  <template v-else>
                    <p class="discussion-message">{{ reply.message }}</p>
                    <div class="discussion-actions">
                      <button type="button" class="discussion-reply-btn" @click="setReplyTarget(reply)">Reply</button>
                      <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn" @click="startEdit(reply)">
                        Edit
                      </button>
                      <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(reply)">
                        Delete
                      </button>
                    </div>
                  </template>
                </li>
              </ul>
            </li>
          </ul>
          <p v-else class="muted">Belum ada diskusi di lesson ini.</p>
          </div>
        </template>

        <template v-else>
          <div id="lesson-panel-assignment" role="tabpanel" aria-labelledby="lesson-tab-assignment">
          <div class="assignment-card">
            <div class="assignment-header">
              <div>
                <p class="eyebrow">Submission & Review</p>
                <h3>{{ lessonAssignment?.title || `Project: ${activeLesson?.title || 'Lesson'}` }}</h3>
              </div>
              <span v-if="myAssignmentSubmission" class="assignment-status" :class="assignmentStatusClass(myAssignmentSubmission.status)">
                {{ assignmentStatusLabel(myAssignmentSubmission.status) }}
              </span>
            </div>
            <p class="muted">{{ lessonAssignment?.instructions || 'Kirimkan hasil tugas melalui link atau lampiran file.' }}</p>
            <div class="assignment-window-meta">
              <span>Due: {{ assignmentDueLabel }}</span>
              <span class="assignment-status" :class="isSubmissionClosed ? 'is-revised' : isLateWindow ? 'is-revised' : 'is-graded'">
                {{ assignmentWindowLabel }}
              </span>
            </div>

            <div v-if="assignmentStore.isLoading" class="muted">Memuat assignment...</div>
            <template v-else>
              <div v-if="canSubmitAssignment" class="assignment-form">
                <label class="assignment-field">
                  <span>Project Link</span>
                  <input v-model="assignmentDraft.linkUrl" class="discussion-input assignment-input" type="url" placeholder="https://..." />
                </label>
                <label class="assignment-field">
                  <span>Notes</span>
                  <textarea
                    v-model="assignmentDraft.notes"
                    class="discussion-input assignment-input"
                    rows="4"
                    placeholder="Ringkas objective, proses, dan hasil..."
                  ></textarea>
                </label>

                <div class="assignment-upload-row">
                  <label class="ghost-btn assignment-upload-btn">
                    Upload Attachment
                    <input ref="assignmentAttachmentInput" type="file" @change="onAssignmentFileChange" />
                  </label>
                  <button v-if="hasAttachment" class="ghost-btn" type="button" @click="clearAssignmentAttachment">Clear</button>
                </div>

                <div v-if="hasAttachment" class="assignment-file-pill">
                  <span>{{ assignmentDraft.attachmentName }}</span>
                  <button type="button" @click="downloadDataUrl(assignmentDraft.attachmentDataUrl, assignmentDraft.attachmentName)">Preview</button>
                </div>

                <div class="hero-actions">
                  <button class="primary-btn" type="button" :disabled="assignmentStore.isSubmitting || isSubmissionClosed" @click="submitAssignment">
                    {{ assignmentStore.isSubmitting ? 'Menyimpan...' : 'Submit Assignment' }}
                  </button>
                </div>
                <p v-if="isSubmissionClosed" class="muted">Batas waktu pengumpulan sudah ditutup.</p>
              </div>

              <div v-if="myAssignmentSubmission" class="assignment-feedback">
                <h4>Feedback</h4>
                <p v-if="myAssignmentSubmission.feedback">{{ myAssignmentSubmission.feedback }}</p>
                <p v-else class="muted">Belum ada feedback dari instructor.</p>
                <p v-if="myAssignmentSubmission.scorePercent !== null" class="assignment-score">
                  Score: <strong>{{ myAssignmentSubmission.scorePercent }}%</strong>
                </p>
              </div>
              <div v-if="myAssignmentSubmission && getSubmissionHistory(myAssignmentSubmission).length" class="assignment-history">
                <h4>Revision History</h4>
                <ul class="assignment-history-list">
                  <li v-for="entry in getSubmissionHistory(myAssignmentSubmission)" :key="entry.id">
                    <p>
                      <strong>{{ formatSubmissionAction(entry.action) }}</strong>
                      <span>{{ formatDiscussionTime(entry.createdAt) }}</span>
                    </p>
                    <span>{{ entry.actor?.name || entry.actor?.email || 'System' }}</span>
                    <small>{{ summarizeHistoryDiff(entry) }}</small>
                    <button type="button" class="assignment-compare-btn" @click="openHistoryCompare(entry)">Compare</button>
                  </li>
                </ul>
              </div>
            </template>
          </div>

          <div v-if="isAssignmentReviewer" class="assignment-review-list">
            <div class="assignment-overview-card">
              <h4>Deadline Overview (This Course)</h4>
              <div class="assignment-overview-tools">
                <label>
                  <span>Module</span>
                  <select v-model="assignmentOverviewModuleFilter" class="assignment-select">
                    <option value="all">All Modules</option>
                    <option v-for="module in assignmentOverviewModuleOptions" :key="`sunrise-module-${module.id}`" :value="module.id">
                      {{ module.title }}
                    </option>
                  </select>
                </label>
                <label class="assignment-overview-selectall">
                  <input type="checkbox" :checked="allVisibleOverviewSelected" @change="toggleSelectAllVisibleOverview" />
                  <span>Select all visible</span>
                </label>
              </div>
              <div class="assignment-overview-table">
                <div class="assignment-overview-row assignment-overview-head">
                  <span>Select</span>
                  <span>Lesson</span>
                  <span>Due Date</span>
                  <span>Grace</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                <div v-for="row in filteredAssignmentOverviewRows" :key="`sunrise-${row.id}`" class="assignment-overview-row">
                  <span>
                    <input type="checkbox" :checked="selectedOverviewLessonIds.includes(row.id)" @change="toggleOverviewLessonSelection(row.id)" />
                  </span>
                  <span>
                    <strong>{{ row.lessonTitle }}</strong>
                    <small>{{ row.moduleTitle }}</small>
                  </span>
                  <span>{{ formatDiscussionTime(row.dueAt) }}</span>
                  <span>{{ row.graceMinutes }} min</span>
                  <span><i class="assignment-status" :class="row.statusClass">{{ row.statusLabel }}</i></span>
                  <span>
                    <button type="button" class="assignment-compare-btn" @click="openLessonFromOverview(row.id)">Open</button>
                  </span>
                </div>
                <p v-if="!filteredAssignmentOverviewRows.length" class="muted">Belum ada lesson pada filter module ini.</p>
              </div>
            </div>
            <div class="assignment-policy-card">
              <h4>Bulk Deadline Update</h4>
              <div class="assignment-bulk-presets">
                <button type="button" class="ghost-btn" @click="applyBulkDuePreset(1)">+1 Hari</button>
                <button type="button" class="ghost-btn" @click="applyBulkDuePreset(3)">+3 Hari</button>
                <button type="button" class="ghost-btn" @click="applyBulkDuePreset(7)">+7 Hari</button>
              </div>
              <div class="assignment-bulk-time-row">
                <select v-model="assignmentBulkTimePreset" class="assignment-select">
                  <option value="09:00">09:00</option>
                  <option value="17:00">17:00</option>
                  <option value="23:59">23:59</option>
                </select>
                <button type="button" class="ghost-btn" @click="applyBulkDueTimePreset(assignmentBulkTimePreset)">Set Jam</button>
              </div>
              <div class="assignment-policy-grid">
                <label class="assignment-field">
                  <span>Due Date</span>
                  <input v-model="assignmentBulkPolicyDraft.dueAtLocal" class="discussion-input assignment-input" type="datetime-local" />
                </label>
                <label class="assignment-field">
                  <span>Grace Minutes</span>
                  <input
                    v-model.number="assignmentBulkPolicyDraft.graceMinutes"
                    class="discussion-input assignment-input"
                    type="number"
                    min="0"
                    max="20160"
                  />
                </label>
              </div>
              <div class="hero-actions">
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="assignmentStore.isSavingBulkPolicy || !selectedOverviewLessonIds.length"
                  @click="saveBulkAssignmentPolicy"
                >
                  {{ assignmentStore.isSavingBulkPolicy ? 'Saving...' : `Apply to ${selectedOverviewLessonIds.length} Lesson` }}
                </button>
              </div>
            </div>
            <div class="assignment-policy-card">
              <h4>Assignment Deadline Policy</h4>
              <div class="assignment-policy-grid">
                <label class="assignment-field">
                  <span>Due Date</span>
                  <input v-model="assignmentPolicyDraft.dueAtLocal" class="discussion-input assignment-input" type="datetime-local" />
                </label>
                <label class="assignment-field">
                  <span>Grace Minutes</span>
                  <input v-model.number="assignmentPolicyDraft.graceMinutes" class="discussion-input assignment-input" type="number" min="0" max="20160" />
                </label>
              </div>
              <div class="hero-actions">
                <button class="primary-btn" type="button" :disabled="assignmentStore.isSavingPolicy" @click="saveAssignmentPolicy">
                  {{ assignmentStore.isSavingPolicy ? 'Saving...' : 'Save Deadline Policy' }}
                </button>
              </div>
            </div>
            <div class="assignment-review-toolbar">
              <label>
                <span>Filter Submission</span>
                <select v-model="assignmentReviewFilter" class="assignment-select">
                  <option value="all">All</option>
                  <option value="submitted">Submitted</option>
                  <option value="revised">Need Revision</option>
                  <option value="graded">Graded</option>
                </select>
              </label>
              <p class="muted">{{ filteredAssignmentItems.length }} / {{ assignmentItems.length }} tampil</p>
            </div>
            <article v-for="submission in filteredAssignmentItems" :key="submission.id" class="assignment-review-item">
              <div class="assignment-review-head">
                <div>
                  <p class="assignment-review-user">{{ submission.userName }}</p>
                  <p class="muted">{{ formatDiscussionTime(submission.updatedAt || submission.submittedAt) }}</p>
                </div>
                <span class="assignment-status" :class="assignmentStatusClass(submission.status)">
                  {{ assignmentStatusLabel(submission.status) }}
                </span>
              </div>

              <a v-if="submission.linkUrl" :href="submission.linkUrl" class="assignment-link" target="_blank" rel="noreferrer">Open Submission Link</a>
              <button
                v-if="submission.attachmentDataUrl || submission.attachmentId"
                type="button"
                class="assignment-inline-link"
                :disabled="downloadingAttachmentId === submission.attachmentId"
                @click="downloadSubmissionAttachment(submission)"
              >
                {{ downloadingAttachmentId === submission.attachmentId ? 'Downloading...' : 'Download Attachment' }}
              </button>
              <p v-if="submission.notes" class="assignment-note">{{ submission.notes }}</p>

              <div v-if="reviewDraftById[submission.id]" class="rubric-list assignment-rubric-grid">
                <label v-for="criterion in lessonAssignment?.rubric || []" :key="`${submission.id}-${criterion.id}`" class="assignment-rubric-item">
                  <span>{{ criterion.label }} <small>(max {{ criterion.maxScore }})</small></span>
                  <input
                    v-model="reviewDraftById[submission.id].rubric[criterion.id]"
                    class="discussion-input assignment-input"
                    type="number"
                    min="0"
                    :max="criterion.maxScore"
                    step="1"
                  />
                  <textarea
                    v-model="reviewDraftById[submission.id].rubricComment[criterion.id]"
                    class="discussion-input assignment-input assignment-rubric-comment"
                    rows="2"
                    placeholder="Komentar per kriteria..."
                  ></textarea>
                </label>
              </div>

              <textarea
                v-if="reviewDraftById[submission.id]"
                v-model="reviewDraftById[submission.id].feedback"
                class="discussion-input assignment-input"
                rows="3"
                placeholder="Feedback instructor..."
              ></textarea>
              <div class="hero-actions">
                <select v-if="reviewDraftById[submission.id]" v-model="reviewDraftById[submission.id].status" class="assignment-select">
                  <option value="graded">Graded</option>
                  <option value="revised">Need Revision</option>
                </select>
                <button class="primary-btn" type="button" :disabled="assignmentStore.isReviewing" @click="submitAssignmentReview(submission)">
                  {{ assignmentStore.isReviewing ? 'Saving...' : 'Save Review' }}
                </button>
              </div>
              <div v-if="getSubmissionHistory(submission).length" class="assignment-history">
                <h4>Revision History</h4>
                <ul class="assignment-history-list">
                  <li v-for="entry in getSubmissionHistory(submission)" :key="entry.id">
                    <p>
                      <strong>{{ formatSubmissionAction(entry.action) }}</strong>
                      <span>{{ formatDiscussionTime(entry.createdAt) }}</span>
                    </p>
                    <span>{{ entry.actor?.name || entry.actor?.email || 'System' }}</span>
                    <small>{{ summarizeHistoryDiff(entry) }}</small>
                    <button type="button" class="assignment-compare-btn" @click="openHistoryCompare(entry)">Compare</button>
                  </li>
                </ul>
              </div>
            </article>
            <p v-if="!filteredAssignmentItems.length" class="muted">Belum ada submission pada filter ini.</p>
          </div>
          </div>
        </template>
      </div>
    </article>

    <article v-if="moduleQuizPrompt" class="card module-quiz-prompt">
      <p class="eyebrow">Module Complete</p>
      <h3>{{ moduleQuizPrompt.moduleTitle }} selesai</h3>
      <p class="muted">Lanjutkan dengan quiz modul untuk mengunci pemahaman sebelum masuk materi berikutnya.</p>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="moduleQuizPrompt = null">Nanti</button>
        <RouterLink class="primary-btn" :to="toModuleQuizRoute(moduleQuizPrompt.quiz, 'module-complete')">Mulai Quiz</RouterLink>
      </div>
    </article>

    <article class="card course-outline-card">
      <div class="section-header">
        <h3>Modul Progress</h3>
        <span class="muted">{{ currentCourse?.completedLessons || 0 }}/{{ currentCourse?.totalLessons || 0 }} selesai</span>
      </div>
      <div class="progress-row course-progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${currentCourse?.progress || 0}%` }"></div>
        </div>
        <strong>{{ currentCourse?.progress || 0 }}%</strong>
      </div>

      <div class="module-stack">
        <section v-for="module in currentCourse?.modules || []" :key="module.id" class="module-block">
          <div class="module-head">
            <h4>{{ module.title }}</h4>
            <span v-if="getModuleGateStatus(module).required && !getModuleGateStatus(module).passed" class="module-gate-badge">
              Quiz Required
            </span>
            <RouterLink
              v-if="isModuleCompleted(module) && getModuleQuiz(module.id)"
              :to="toModuleQuizRoute(getModuleQuiz(module.id), 'outline')"
              class="module-quiz-link"
            >
              Quiz Modul
            </RouterLink>
          </div>
          <ul class="lesson-list">
            <li
              v-for="lesson in module.lessons"
              :key="lesson.id"
              class="lesson-row"
              :class="{ active: lesson.isActive, done: lesson.isCompleted, locked: lesson.isLocked }"
            >
              <button type="button" class="lesson-btn" :disabled="lesson.isLocked" @click="selectLesson(lesson)">
                <span class="lesson-title">{{ lesson.title }}</span>
                <span class="lesson-meta">
                  {{ lesson.isLocked ? 'Locked' : lesson.isCompleted ? 'Completed' : lesson.duration }}
                </span>
              </button>
              <p v-if="lesson.isLocked && lesson.lockReason" class="lesson-lock-hint">{{ lesson.lockReason }}</p>
            </li>
          </ul>
        </section>
      </div>

      <div v-if="canConfigurePrerequisite" class="prerequisite-editor-card">
        <div class="section-header">
          <h4>Module Prerequisite</h4>
          <span class="muted">Atur rule lock/unlock lesson pertama per module.</span>
        </div>
        <div class="prerequisite-editor-toolbar">
          <label>
            <span>Target Module</span>
            <select v-model="prerequisiteEditorModuleId" class="assignment-select">
              <option v-for="module in prerequisiteModuleOptions" :key="`sunrise-prereq-module-${module.id}`" :value="module.id">
                {{ module.title }}
              </option>
            </select>
          </label>
          <label>
            <span>Match</span>
            <select v-model="prerequisiteEditorMode" class="assignment-select">
              <option value="all">All rules required (AND)</option>
              <option value="any">Any rule can unlock (OR)</option>
            </select>
          </label>
        </div>
        <div class="prerequisite-preset-row">
          <button class="ghost-btn" type="button" @click="applyPrerequisitePreset('sequential-default')">Default Sequence</button>
          <button class="ghost-btn" type="button" @click="applyPrerequisitePreset('quiz-first')">Quiz Gate</button>
          <button class="ghost-btn" type="button" @click="applyPrerequisitePreset('fast-track')">Fast Track</button>
        </div>
        <p v-if="prerequisiteInvalidCount > 0" class="prerequisite-status error">
          {{ prerequisiteInvalidCount }} rule invalid. Perbaiki dulu sebelum menyimpan.
        </p>
        <p v-else-if="prerequisiteWarningCount > 0" class="prerequisite-status warning">
          {{ prerequisiteWarningCount }} warning terdeteksi. Kamu tetap bisa simpan.
        </p>
        <p v-else-if="!hasPrerequisiteChanges" class="prerequisite-status muted">Belum ada perubahan.</p>
        <div class="prerequisite-rule-list">
          <div v-for="(rule, ruleIndex) in prerequisiteEditorRules" :key="`sunrise-pr-rule-${rule.id}`" class="prerequisite-rule-wrap">
            <div class="prerequisite-rule-item" :class="{ invalid: prerequisiteRuleDiagnostics[ruleIndex]?.state === 'error' }">
            <select v-model="rule.type" class="assignment-select" @change="onPrerequisiteRuleTypeChange(rule)">
              <option value="module-complete">Module Completed</option>
              <option value="module-quiz-pass">Module Quiz Passed</option>
              <option value="lesson-complete">Lesson Completed</option>
            </select>
            <select v-if="rule.type !== 'lesson-complete'" v-model="rule.moduleId" class="assignment-select">
              <option v-for="module in prerequisiteRuleModuleOptions" :key="`sunrise-prereq-ref-module-${module.id}`" :value="module.id">
                {{ module.title }}
              </option>
            </select>
            <select v-else v-model="rule.lessonId" class="assignment-select">
              <option v-for="lesson in prerequisiteRuleLessonOptions" :key="`sunrise-prereq-ref-lesson-${lesson.id}`" :value="lesson.id">
                {{ lesson.title }}
              </option>
            </select>
            <button class="ghost-btn prerequisite-remove-btn" type="button" @click="removePrerequisiteRule(rule.id)">Remove</button>
            </div>
            <p
              v-if="prerequisiteRuleDiagnostics[ruleIndex]?.state !== 'ok'"
              class="prerequisite-rule-note"
              :class="prerequisiteRuleDiagnostics[ruleIndex]?.state"
            >
              {{ prerequisiteRuleDiagnostics[ruleIndex]?.message }}
            </p>
          </div>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" @click="addPrerequisiteRule('module-complete')">+ Module Rule</button>
          <button class="ghost-btn" type="button" @click="addPrerequisiteRule('lesson-complete')">+ Lesson Rule</button>
          <button class="primary-btn" type="button" :disabled="!canSavePrerequisite" @click="saveModulePrerequisite">
            {{ isSavingPrerequisite ? 'Saving...' : 'Save Prerequisite' }}
          </button>
        </div>
      </div>
    </article>

  </section>

  <section v-else class="course-player-layout aurora-player-layout">
    <article class="card aurora-player-panel">
      <div class="aurora-player-top">
        <div>
          <p class="eyebrow">{{ currentCourse?.title || 'Course' }}</p>
          <h2>{{ activeLesson?.title || 'Loading lesson...' }}</h2>
          <p class="muted">{{ activeLesson?.summary || 'Menyiapkan konten lesson...' }}</p>
        </div>
        <div class="aurora-badge">{{ currentCourse?.progress || 0 }}%</div>
      </div>

      <div class="lesson-stage aurora-stage" :style="{ background: currentCourse?.gradient || fallbackGradient }">
        <span>{{ activeLesson?.duration || '-' }} · {{ activeLesson?.type || 'lesson' }}</span>
      </div>

      <div class="resource-chips">
        <span v-for="resource in activeLessonResources" :key="resource.id" class="resource-chip">{{ resource.title }}</span>
      </div>

      <div class="tab-strip" role="tablist" aria-label="Lesson Sections">
        <p v-if="pendingPlaybackSyncCount > 0" class="sync-queue-indicator" role="status" aria-live="polite">
          {{ pendingPlaybackSyncCount }} progress update menunggu sinkronisasi.
          <span v-if="failedPlaybackSyncCount > 0"> ({{ failedPlaybackSyncCount }} retry)</span>
        </p>
        <button
          id="lesson-tab-material"
          class="tab"
          :class="{ active: activeTab === 'material' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'material'"
          aria-controls="lesson-panel-material"
          :tabindex="activeTab === 'material' ? 0 : -1"
          @click="activeTab = 'material'"
        >
          Materi
        </button>
        <button
          id="lesson-tab-resources"
          class="tab"
          :class="{ active: activeTab === 'resources' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'resources'"
          aria-controls="lesson-panel-resources"
          :tabindex="activeTab === 'resources' ? 0 : -1"
          @click="activeTab = 'resources'"
        >
          Resources
        </button>
        <button
          id="lesson-tab-discussion"
          class="tab"
          :class="{ active: activeTab === 'discussion' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'discussion'"
          aria-controls="lesson-panel-discussion"
          :tabindex="activeTab === 'discussion' ? 0 : -1"
          @click="activeTab = 'discussion'"
        >
          Discussion
        </button>
        <button
          id="lesson-tab-assignment"
          class="tab"
          :class="{ active: activeTab === 'assignment' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'assignment'"
          aria-controls="lesson-panel-assignment"
          :tabindex="activeTab === 'assignment' ? 0 : -1"
          @click="activeTab = 'assignment'"
        >
          Assignment
        </button>
      </div>

      <template v-if="activeTab === 'material'">
        <div id="lesson-panel-material" role="tabpanel" aria-labelledby="lesson-tab-material">
        <div v-if="activeLesson?.type === 'video' && activeLesson?.videoUrl" class="video-player-shell">
          <video
            ref="lessonVideoRef"
            class="lesson-video-player"
            controls
            playsinline
            preload="metadata"
            :src="activeLesson.videoUrl"
            @loadstart="onVideoLoadStart"
            @play="onVideoPlay"
            @loadedmetadata="onVideoLoadedMetadata"
            @error="onVideoError"
            @timeupdate="onVideoTimeUpdate"
            @pause="onVideoPause"
            @ended="onVideoEnded"
          ></video>
          <div v-if="videoLoadErrorTitle" class="video-error-panel">
            <p class="video-error-title">{{ videoLoadErrorTitle }}</p>
            <p v-if="videoLoadErrorDetail" class="video-error-detail">{{ videoLoadErrorDetail }}</p>
            <button class="ghost-btn video-error-action" type="button" @click="openVideoSourceInNewTab">Open video URL</button>
          </div>
          <div class="video-player-meta">
            <span>Resume {{ formatSeconds(displayVideoResumeSec) }}</span>
            <strong>{{ displayVideoProgressPercent }}% watched</strong>
          </div>
          <label class="video-auto-complete-toggle">
            <input v-model="autoCompleteVideoEnabled" type="checkbox" />
            <span>Auto complete saat capai target</span>
          </label>
        </div>
        <article v-else-if="activeLesson?.type === 'article'" class="lesson-type-panel">
          <h4>Article Lesson</h4>
          <p class="muted">Baca materi artikel dan lanjutkan ke lesson berikutnya saat selesai.</p>
          <p v-if="activeLesson.articleContent" class="lesson-article-content">{{ activeLesson.articleContent }}</p>
          <div class="table-actions">
            <a v-if="activeLesson.articleReferenceUrl" class="ghost-btn" :href="activeLesson.articleReferenceUrl" target="_blank" rel="noopener noreferrer">Open Reference</a>
            <button
              v-if="activeLesson.articleAttachmentId || activeLesson.articleAttachmentDataUrl || activeLesson.articleAttachmentUrl"
              class="ghost-btn"
              type="button"
              @click="downloadActiveLessonArticleAttachment"
            >
              Download Attachment
            </button>
          </div>
        </article>
        <article v-else-if="activeLesson?.type === 'quiz'" class="lesson-type-panel">
          <h4>Quiz Lesson</h4>
          <p class="muted">Lesson ini terhubung ke quiz engine yang sudah ada.</p>
          <p class="muted"><strong>Quiz ID:</strong> {{ activeLesson.quizId || '-' }}</p>
          <div class="table-actions">
            <RouterLink v-if="activeLesson.quizId" class="primary-btn" :to="toLessonQuizRoute(activeLesson.quizId)">Mulai Quiz</RouterLink>
            <RouterLink class="ghost-btn" :to="{ name: 'quiz-admin' }">Manage Quiz</RouterLink>
          </div>
        </article>
        <article v-else-if="activeLesson?.type === 'assignment'" class="lesson-type-panel">
          <h4>Assignment Lesson</h4>
          <p class="muted">{{ activeLesson.assignmentInstruction || 'Baca instruksi tugas lalu submit di tab Assignment.' }}</p>
          <p class="muted"><strong>Mode:</strong> {{ activeLesson.assignmentMode || 'file' }} · <strong>Due:</strong> {{ activeLesson.assignmentDueAt || '-' }}</p>
          <div class="table-actions">
            <button class="ghost-btn" type="button" @click="activeTab = 'assignment'">Open Assignment Tab</button>
          </div>
        </article>
        <article v-else-if="activeLesson?.type === 'live'" class="lesson-type-panel">
          <h4>Live Session</h4>
          <p class="muted"><strong>Start:</strong> {{ activeLesson.liveStartAt || '-' }} · <strong>Timezone:</strong> {{ activeLesson.liveTimezone || 'Asia/Jakarta' }}</p>
          <div class="table-actions">
            <a v-if="activeLesson.liveMeetingUrl" class="primary-btn" :href="activeLesson.liveMeetingUrl" target="_blank" rel="noopener noreferrer">Join Meeting</a>
          </div>
        </article>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" :disabled="!previousLesson" @click="goPrevious">Prev</button>
          <button class="primary-btn" type="button" :disabled="isCompleting || !activeLesson || !canCompleteActiveLesson" @click="markComplete">
            {{ isCompleting ? 'Saving...' : 'Complete & Next' }}
          </button>
          <button class="ghost-btn" type="button" :disabled="!nextLesson || nextLesson.isLocked" @click="goNext">Next</button>
        </div>
        <p v-if="activeLesson && !canCompleteActiveLesson" class="muted">
          {{ activeLessonCompletionHint }}
        </p>
        <div v-if="activeLesson?.type === 'video'" class="lesson-enhancement-grid">
          <section class="lesson-side-card">
            <div class="section-header">
              <h4>Bookmark & Notes</h4>
              <span class="muted">{{ lessonNotes.length }} catatan</span>
            </div>
            <p class="muted">Simpan poin penting berdasarkan timestamp video.</p>
            <div class="lesson-note-form">
              <label class="assignment-field">
                <span>Timestamp</span>
                <input
                  v-model="noteDraftTimestampInput"
                  class="assignment-input"
                  type="text"
                  inputmode="numeric"
                  placeholder="00:00"
                  aria-label="Note timestamp"
                />
              </label>
              <label class="assignment-field">
                <span>Catatan</span>
                <textarea v-model="noteDraftText" class="assignment-input" rows="2" placeholder="Contoh: prinsip kontras untuk CTA" aria-label="Note content"></textarea>
              </label>
              <div class="hero-actions">
                <button class="ghost-btn" type="button" :disabled="!lessonVideoRef" @click="setNoteTimestampFromCurrent">Use Current Time</button>
                <button class="primary-btn" type="button" :disabled="notesStore.isSubmitting || !canSaveNoteDraft" @click="saveNoteDraft">
                  {{ notesStore.isSubmitting ? 'Saving...' : editingNoteId ? 'Update Note' : 'Add Note' }}
                </button>
                <button v-if="editingNoteId" class="ghost-btn" type="button" @click="cancelNoteEdit">Cancel</button>
              </div>
            </div>
            <p v-if="notesStore.isLoading" class="muted">Memuat catatan...</p>
            <ul v-else-if="lessonNotes.length" class="lesson-note-list">
              <li v-for="item in lessonNotes" :key="`aurora-note-${item.id}`">
                <button type="button" class="lesson-timestamp-btn" @click="seekToTimestamp(item.timestampSec)">
                  {{ formatSeconds(item.timestampSec) }}
                </button>
                <p>{{ item.note }}</p>
                <div class="lesson-note-actions">
                  <button type="button" class="assignment-compare-btn" @click="startNoteEdit(item)">Edit</button>
                  <button type="button" class="assignment-compare-btn" @click="removeNote(item.id)">Delete</button>
                </div>
              </li>
            </ul>
          </section>
          <section class="lesson-side-card">
            <div class="section-header">
              <h4>Transcript</h4>
              <span class="muted">{{ filteredTranscriptRows.length }} baris</span>
            </div>
            <input v-model="transcriptQuery" class="assignment-input" type="search" placeholder="Cari kata di transcript..." aria-label="Search transcript" />
            <ul v-if="filteredTranscriptRows.length" class="transcript-list">
              <li v-for="row in filteredTranscriptRows" :key="`aurora-transcript-${row.id}`">
                <button type="button" class="lesson-timestamp-btn" @click="seekToTimestamp(row.atSec)">{{ formatSeconds(row.atSec) }}</button>
                <p>{{ row.text }}</p>
              </li>
            </ul>
            <p v-else class="muted">Transcript tidak ditemukan untuk kata kunci ini.</p>
          </section>
        </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'resources'">
        <div id="lesson-panel-resources" role="tabpanel" aria-labelledby="lesson-tab-resources">
        <p class="lesson-summary">Resources untuk lesson ini bisa kamu gunakan sebagai referensi tugas.</p>
        <div class="lesson-resource-list">
          <article v-for="resource in activeLessonResources" :key="resource.id" class="lesson-resource-item">
            <div>
              <strong>{{ resource.title }}</strong>
              <p class="muted">{{ resource.fileName }} · {{ formatBytes(resource.sizeBytes) }}</p>
            </div>
            <button class="ghost-btn" type="button" :disabled="!resource.dataUrl" @click="downloadLessonResource(resource)">
              Download
            </button>
          </article>
        </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'discussion'">
        <div id="lesson-panel-discussion" role="tabpanel" aria-labelledby="lesson-tab-discussion">
        <div class="discussion-composer">
          <p v-if="replyTarget" class="reply-indicator">
            Membalas {{ replyTarget.authorName }}
            <button type="button" @click="clearReplyTarget">Batal</button>
          </p>
          <textarea
            v-model="discussionDraft"
            class="discussion-input"
            placeholder="Tulis pertanyaan atau insight kamu..."
            rows="3"
          ></textarea>
          <ul v-if="mentionSuggestions.length" class="mention-suggestion-list">
            <li v-for="user in mentionSuggestions" :key="`aurora-${user.id}`">
              <button type="button" @click="applyMention(user)">
                <strong>@{{ user.handle }}</strong>
                <span>{{ user.name }}</span>
              </button>
            </li>
          </ul>
          <div class="hero-actions">
            <button
              class="primary-btn"
              type="button"
              :disabled="discussionStore.isSubmitting || !discussionDraft.trim() || !activeLesson"
              @click="submitDiscussion"
            >
              {{ discussionStore.isSubmitting ? 'Mengirim...' : 'Kirim Komentar' }}
            </button>
          </div>
        </div>

        <p v-if="discussionStore.isLoading" class="muted">Memuat diskusi...</p>
        <ul v-else-if="threadedDiscussions.length" class="discussion-list">
          <li v-for="thread in threadedDiscussions" :key="thread.root.id" class="discussion-thread">
            <article
              class="discussion-item"
              :class="{ 'focus-target': focusDiscussionId === thread.root.id }"
              :data-discussion-id="thread.root.id"
            >
              <p class="discussion-meta">{{ thread.root.authorName }} · {{ formatDiscussionTime(thread.root.createdAt) }}</p>
              <template v-if="editingItemId === thread.root.id">
                <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                <div class="discussion-actions">
                  <button type="button" class="discussion-reply-btn" @click="saveEdit(thread.root)">Save</button>
                  <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                </div>
              </template>
              <template v-else>
                <p class="discussion-message">{{ thread.root.message }}</p>
                <div class="discussion-actions">
                  <button type="button" class="discussion-reply-btn" @click="setReplyTarget(thread.root)">Reply</button>
                  <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn" @click="startEdit(thread.root)">
                    Edit
                  </button>
                  <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(thread.root)">
                    Delete
                  </button>
                </div>
              </template>
            </article>
            <ul v-if="thread.replies.length" class="discussion-reply-list">
              <li
                v-for="reply in thread.replies"
                :key="reply.id"
                class="discussion-item discussion-item-reply"
                :class="{ 'focus-target': focusDiscussionId === reply.id }"
                :data-discussion-id="reply.id"
              >
                <p class="discussion-meta">{{ reply.authorName }} · {{ formatDiscussionTime(reply.createdAt) }}</p>
                <template v-if="editingItemId === reply.id">
                  <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="saveEdit(reply)">Save</button>
                    <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <p class="discussion-message">{{ reply.message }}</p>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="setReplyTarget(reply)">Reply</button>
                    <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn" @click="startEdit(reply)">
                      Edit
                    </button>
                    <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(reply)">
                      Delete
                    </button>
                  </div>
                </template>
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="muted">Belum ada diskusi di lesson ini.</p>
        </div>
      </template>

      <template v-else>
        <div id="lesson-panel-assignment" role="tabpanel" aria-labelledby="lesson-tab-assignment">
        <div class="assignment-card">
          <div class="assignment-header">
            <div>
              <p class="eyebrow">Submission & Review</p>
              <h3>{{ lessonAssignment?.title || `Project: ${activeLesson?.title || 'Lesson'}` }}</h3>
            </div>
            <span v-if="myAssignmentSubmission" class="assignment-status" :class="assignmentStatusClass(myAssignmentSubmission.status)">
              {{ assignmentStatusLabel(myAssignmentSubmission.status) }}
            </span>
          </div>
          <p class="muted">{{ lessonAssignment?.instructions || 'Kirimkan hasil tugas melalui link atau lampiran file.' }}</p>
          <div class="assignment-window-meta">
            <span>Due: {{ assignmentDueLabel }}</span>
            <span class="assignment-status" :class="isSubmissionClosed ? 'is-revised' : isLateWindow ? 'is-revised' : 'is-graded'">
              {{ assignmentWindowLabel }}
            </span>
          </div>

          <div v-if="assignmentStore.isLoading" class="muted">Memuat assignment...</div>
          <template v-else>
            <div v-if="canSubmitAssignment" class="assignment-form">
              <label class="assignment-field">
                <span>Project Link</span>
                <input v-model="assignmentDraft.linkUrl" class="discussion-input assignment-input" type="url" placeholder="https://..." />
              </label>
              <label class="assignment-field">
                <span>Notes</span>
                <textarea
                  v-model="assignmentDraft.notes"
                  class="discussion-input assignment-input"
                  rows="4"
                  placeholder="Ringkas objective, proses, dan hasil..."
                ></textarea>
              </label>

              <div class="assignment-upload-row">
                <label class="ghost-btn assignment-upload-btn">
                  Upload Attachment
                  <input ref="assignmentAttachmentInput" type="file" @change="onAssignmentFileChange" />
                </label>
                <button v-if="hasAttachment" class="ghost-btn" type="button" @click="clearAssignmentAttachment">Clear</button>
              </div>

              <div v-if="hasAttachment" class="assignment-file-pill">
                <span>{{ assignmentDraft.attachmentName }}</span>
                <button type="button" @click="downloadDataUrl(assignmentDraft.attachmentDataUrl, assignmentDraft.attachmentName)">Preview</button>
              </div>

              <div class="hero-actions">
                <button class="primary-btn" type="button" :disabled="assignmentStore.isSubmitting || isSubmissionClosed" @click="submitAssignment">
                  {{ assignmentStore.isSubmitting ? 'Menyimpan...' : 'Submit Assignment' }}
                </button>
              </div>
              <p v-if="isSubmissionClosed" class="muted">Batas waktu pengumpulan sudah ditutup.</p>
            </div>

            <div v-if="myAssignmentSubmission" class="assignment-feedback">
              <h4>Feedback</h4>
              <p v-if="myAssignmentSubmission.feedback">{{ myAssignmentSubmission.feedback }}</p>
              <p v-else class="muted">Belum ada feedback dari instructor.</p>
              <p v-if="myAssignmentSubmission.scorePercent !== null" class="assignment-score">
                Score: <strong>{{ myAssignmentSubmission.scorePercent }}%</strong>
              </p>
            </div>
            <div v-if="myAssignmentSubmission && getSubmissionHistory(myAssignmentSubmission).length" class="assignment-history">
              <h4>Revision History</h4>
              <ul class="assignment-history-list">
                <li v-for="entry in getSubmissionHistory(myAssignmentSubmission)" :key="entry.id">
                  <p>
                    <strong>{{ formatSubmissionAction(entry.action) }}</strong>
                    <span>{{ formatDiscussionTime(entry.createdAt) }}</span>
                  </p>
                  <span>{{ entry.actor?.name || entry.actor?.email || 'System' }}</span>
                  <small>{{ summarizeHistoryDiff(entry) }}</small>
                  <button type="button" class="assignment-compare-btn" @click="openHistoryCompare(entry)">Compare</button>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <div v-if="isAssignmentReviewer" class="assignment-review-list">
          <div class="assignment-overview-card">
            <h4>Deadline Overview (This Course)</h4>
            <div class="assignment-overview-tools">
              <label>
                <span>Module</span>
                <select v-model="assignmentOverviewModuleFilter" class="assignment-select">
                  <option value="all">All Modules</option>
                  <option v-for="module in assignmentOverviewModuleOptions" :key="`aurora-module-${module.id}`" :value="module.id">
                    {{ module.title }}
                  </option>
                </select>
              </label>
              <label class="assignment-overview-selectall">
                <input type="checkbox" :checked="allVisibleOverviewSelected" @change="toggleSelectAllVisibleOverview" />
                <span>Select all visible</span>
              </label>
            </div>
            <div class="assignment-overview-table">
              <div class="assignment-overview-row assignment-overview-head">
                <span>Select</span>
                <span>Lesson</span>
                <span>Due Date</span>
                <span>Grace</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              <div v-for="row in filteredAssignmentOverviewRows" :key="`aurora-${row.id}`" class="assignment-overview-row">
                <span>
                  <input type="checkbox" :checked="selectedOverviewLessonIds.includes(row.id)" @change="toggleOverviewLessonSelection(row.id)" />
                </span>
                <span>
                  <strong>{{ row.lessonTitle }}</strong>
                  <small>{{ row.moduleTitle }}</small>
                </span>
                <span>{{ formatDiscussionTime(row.dueAt) }}</span>
                <span>{{ row.graceMinutes }} min</span>
                <span><i class="assignment-status" :class="row.statusClass">{{ row.statusLabel }}</i></span>
                <span>
                  <button type="button" class="assignment-compare-btn" @click="openLessonFromOverview(row.id)">Open</button>
                </span>
              </div>
              <p v-if="!filteredAssignmentOverviewRows.length" class="muted">Belum ada lesson pada filter module ini.</p>
            </div>
          </div>
          <div class="assignment-policy-card">
            <h4>Bulk Deadline Update</h4>
            <div class="assignment-bulk-presets">
              <button type="button" class="ghost-btn" @click="applyBulkDuePreset(1)">+1 Hari</button>
              <button type="button" class="ghost-btn" @click="applyBulkDuePreset(3)">+3 Hari</button>
              <button type="button" class="ghost-btn" @click="applyBulkDuePreset(7)">+7 Hari</button>
            </div>
            <div class="assignment-bulk-time-row">
              <select v-model="assignmentBulkTimePreset" class="assignment-select">
                <option value="09:00">09:00</option>
                <option value="17:00">17:00</option>
                <option value="23:59">23:59</option>
              </select>
              <button type="button" class="ghost-btn" @click="applyBulkDueTimePreset(assignmentBulkTimePreset)">Set Jam</button>
            </div>
            <div class="assignment-policy-grid">
              <label class="assignment-field">
                <span>Due Date</span>
                <input v-model="assignmentBulkPolicyDraft.dueAtLocal" class="discussion-input assignment-input" type="datetime-local" />
              </label>
              <label class="assignment-field">
                <span>Grace Minutes</span>
                <input
                  v-model.number="assignmentBulkPolicyDraft.graceMinutes"
                  class="discussion-input assignment-input"
                  type="number"
                  min="0"
                  max="20160"
                />
              </label>
            </div>
            <div class="hero-actions">
              <button
                class="primary-btn"
                type="button"
                :disabled="assignmentStore.isSavingBulkPolicy || !selectedOverviewLessonIds.length"
                @click="saveBulkAssignmentPolicy"
              >
                {{ assignmentStore.isSavingBulkPolicy ? 'Saving...' : `Apply to ${selectedOverviewLessonIds.length} Lesson` }}
              </button>
            </div>
          </div>
          <div class="assignment-policy-card">
            <h4>Assignment Deadline Policy</h4>
            <div class="assignment-policy-grid">
              <label class="assignment-field">
                <span>Due Date</span>
                <input v-model="assignmentPolicyDraft.dueAtLocal" class="discussion-input assignment-input" type="datetime-local" />
              </label>
              <label class="assignment-field">
                <span>Grace Minutes</span>
                <input v-model.number="assignmentPolicyDraft.graceMinutes" class="discussion-input assignment-input" type="number" min="0" max="20160" />
              </label>
            </div>
            <div class="hero-actions">
              <button class="primary-btn" type="button" :disabled="assignmentStore.isSavingPolicy" @click="saveAssignmentPolicy">
                {{ assignmentStore.isSavingPolicy ? 'Saving...' : 'Save Deadline Policy' }}
              </button>
            </div>
          </div>
          <div class="assignment-review-toolbar">
            <label>
              <span>Filter Submission</span>
              <select v-model="assignmentReviewFilter" class="assignment-select">
                <option value="all">All</option>
                <option value="submitted">Submitted</option>
                <option value="revised">Need Revision</option>
                <option value="graded">Graded</option>
              </select>
            </label>
            <p class="muted">{{ filteredAssignmentItems.length }} / {{ assignmentItems.length }} tampil</p>
          </div>
          <article v-for="submission in filteredAssignmentItems" :key="submission.id" class="assignment-review-item">
            <div class="assignment-review-head">
              <div>
                <p class="assignment-review-user">{{ submission.userName }}</p>
                <p class="muted">{{ formatDiscussionTime(submission.updatedAt || submission.submittedAt) }}</p>
              </div>
              <span class="assignment-status" :class="assignmentStatusClass(submission.status)">
                {{ assignmentStatusLabel(submission.status) }}
              </span>
            </div>

            <a v-if="submission.linkUrl" :href="submission.linkUrl" class="assignment-link" target="_blank" rel="noreferrer">Open Submission Link</a>
            <button
              v-if="submission.attachmentDataUrl || submission.attachmentId"
              type="button"
              class="assignment-inline-link"
              :disabled="downloadingAttachmentId === submission.attachmentId"
              @click="downloadSubmissionAttachment(submission)"
            >
              {{ downloadingAttachmentId === submission.attachmentId ? 'Downloading...' : 'Download Attachment' }}
            </button>
            <p v-if="submission.notes" class="assignment-note">{{ submission.notes }}</p>

            <div v-if="reviewDraftById[submission.id]" class="rubric-list assignment-rubric-grid">
              <label v-for="criterion in lessonAssignment?.rubric || []" :key="`${submission.id}-${criterion.id}`" class="assignment-rubric-item">
                <span>{{ criterion.label }} <small>(max {{ criterion.maxScore }})</small></span>
                <input
                  v-model="reviewDraftById[submission.id].rubric[criterion.id]"
                  class="discussion-input assignment-input"
                  type="number"
                  min="0"
                  :max="criterion.maxScore"
                  step="1"
                />
                <textarea
                  v-model="reviewDraftById[submission.id].rubricComment[criterion.id]"
                  class="discussion-input assignment-input assignment-rubric-comment"
                  rows="2"
                  placeholder="Komentar per kriteria..."
                ></textarea>
              </label>
            </div>

            <textarea
              v-if="reviewDraftById[submission.id]"
              v-model="reviewDraftById[submission.id].feedback"
              class="discussion-input assignment-input"
              rows="3"
              placeholder="Feedback instructor..."
            ></textarea>
            <div class="hero-actions">
              <select v-if="reviewDraftById[submission.id]" v-model="reviewDraftById[submission.id].status" class="assignment-select">
                <option value="graded">Graded</option>
                <option value="revised">Need Revision</option>
              </select>
              <button class="primary-btn" type="button" :disabled="assignmentStore.isReviewing" @click="submitAssignmentReview(submission)">
                {{ assignmentStore.isReviewing ? 'Saving...' : 'Save Review' }}
              </button>
            </div>
            <div v-if="getSubmissionHistory(submission).length" class="assignment-history">
              <h4>Revision History</h4>
              <ul class="assignment-history-list">
                <li v-for="entry in getSubmissionHistory(submission)" :key="entry.id">
                  <p>
                    <strong>{{ formatSubmissionAction(entry.action) }}</strong>
                    <span>{{ formatDiscussionTime(entry.createdAt) }}</span>
                  </p>
                  <span>{{ entry.actor?.name || entry.actor?.email || 'System' }}</span>
                  <small>{{ summarizeHistoryDiff(entry) }}</small>
                  <button type="button" class="assignment-compare-btn" @click="openHistoryCompare(entry)">Compare</button>
                </li>
              </ul>
            </div>
          </article>
          <p v-if="!filteredAssignmentItems.length" class="muted">Belum ada submission pada filter ini.</p>
        </div>
        </div>
      </template>
    </article>

    <article class="card aurora-outline-panel">
      <div class="section-header">
        <h3>Course Outline</h3>
        <span class="muted">{{ currentCourse?.completedLessons || 0 }}/{{ currentCourse?.totalLessons || 0 }} done</span>
      </div>

      <div class="module-stack">
        <section v-for="module in currentCourse?.modules || []" :key="module.id" class="module-block">
          <div class="module-head">
            <h4>{{ module.title }}</h4>
            <span v-if="getModuleGateStatus(module).required && !getModuleGateStatus(module).passed" class="module-gate-badge">
              Quiz Required
            </span>
            <RouterLink
              v-if="isModuleCompleted(module) && getModuleQuiz(module.id)"
              :to="toModuleQuizRoute(getModuleQuiz(module.id), 'outline')"
              class="module-quiz-link"
            >
              Quiz Modul
            </RouterLink>
          </div>
          <ul class="lesson-list">
            <li
              v-for="lesson in module.lessons"
              :key="lesson.id"
              class="lesson-row"
              :class="{ active: lesson.isActive, done: lesson.isCompleted, locked: lesson.isLocked }"
            >
              <button type="button" class="lesson-btn" :disabled="lesson.isLocked" @click="selectLesson(lesson)">
                <span class="lesson-title">{{ lesson.title }}</span>
                <span class="lesson-meta">
                  {{ lesson.isLocked ? 'Locked' : lesson.isCompleted ? 'Completed' : lesson.duration }}
                </span>
              </button>
              <p v-if="lesson.isLocked && lesson.lockReason" class="lesson-lock-hint">{{ lesson.lockReason }}</p>
            </li>
          </ul>
        </section>
      </div>

      <div v-if="canConfigurePrerequisite" class="prerequisite-editor-card">
        <div class="section-header">
          <h4>Module Prerequisite</h4>
          <span class="muted">Atur rule lock/unlock lesson pertama per module.</span>
        </div>
        <div class="prerequisite-editor-toolbar">
          <label>
            <span>Target Module</span>
            <select v-model="prerequisiteEditorModuleId" class="assignment-select">
              <option v-for="module in prerequisiteModuleOptions" :key="`aurora-prereq-module-${module.id}`" :value="module.id">
                {{ module.title }}
              </option>
            </select>
          </label>
          <label>
            <span>Match</span>
            <select v-model="prerequisiteEditorMode" class="assignment-select">
              <option value="all">All rules required (AND)</option>
              <option value="any">Any rule can unlock (OR)</option>
            </select>
          </label>
        </div>
        <div class="prerequisite-preset-row">
          <button class="ghost-btn" type="button" @click="applyPrerequisitePreset('sequential-default')">Default Sequence</button>
          <button class="ghost-btn" type="button" @click="applyPrerequisitePreset('quiz-first')">Quiz Gate</button>
          <button class="ghost-btn" type="button" @click="applyPrerequisitePreset('fast-track')">Fast Track</button>
        </div>
        <p v-if="prerequisiteInvalidCount > 0" class="prerequisite-status error">
          {{ prerequisiteInvalidCount }} rule invalid. Perbaiki dulu sebelum menyimpan.
        </p>
        <p v-else-if="prerequisiteWarningCount > 0" class="prerequisite-status warning">
          {{ prerequisiteWarningCount }} warning terdeteksi. Kamu tetap bisa simpan.
        </p>
        <p v-else-if="!hasPrerequisiteChanges" class="prerequisite-status muted">Belum ada perubahan.</p>
        <div class="prerequisite-rule-list">
          <div v-for="(rule, ruleIndex) in prerequisiteEditorRules" :key="`aurora-pr-rule-${rule.id}`" class="prerequisite-rule-wrap">
            <div class="prerequisite-rule-item" :class="{ invalid: prerequisiteRuleDiagnostics[ruleIndex]?.state === 'error' }">
            <select v-model="rule.type" class="assignment-select" @change="onPrerequisiteRuleTypeChange(rule)">
              <option value="module-complete">Module Completed</option>
              <option value="module-quiz-pass">Module Quiz Passed</option>
              <option value="lesson-complete">Lesson Completed</option>
            </select>
            <select v-if="rule.type !== 'lesson-complete'" v-model="rule.moduleId" class="assignment-select">
              <option v-for="module in prerequisiteRuleModuleOptions" :key="`aurora-prereq-ref-module-${module.id}`" :value="module.id">
                {{ module.title }}
              </option>
            </select>
            <select v-else v-model="rule.lessonId" class="assignment-select">
              <option v-for="lesson in prerequisiteRuleLessonOptions" :key="`aurora-prereq-ref-lesson-${lesson.id}`" :value="lesson.id">
                {{ lesson.title }}
              </option>
            </select>
            <button class="ghost-btn prerequisite-remove-btn" type="button" @click="removePrerequisiteRule(rule.id)">Remove</button>
            </div>
            <p
              v-if="prerequisiteRuleDiagnostics[ruleIndex]?.state !== 'ok'"
              class="prerequisite-rule-note"
              :class="prerequisiteRuleDiagnostics[ruleIndex]?.state"
            >
              {{ prerequisiteRuleDiagnostics[ruleIndex]?.message }}
            </p>
          </div>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" @click="addPrerequisiteRule('module-complete')">+ Module Rule</button>
          <button class="ghost-btn" type="button" @click="addPrerequisiteRule('lesson-complete')">+ Lesson Rule</button>
          <button class="primary-btn" type="button" :disabled="!canSavePrerequisite" @click="saveModulePrerequisite">
            {{ isSavingPrerequisite ? 'Saving...' : 'Save Prerequisite' }}
          </button>
        </div>
      </div>
    </article>

    <article v-if="moduleQuizPrompt" class="card module-quiz-prompt">
      <p class="eyebrow">Module Complete</p>
      <h3>{{ moduleQuizPrompt.moduleTitle }} selesai</h3>
      <p class="muted">Lanjutkan dengan quiz modul untuk mengunci pemahaman sebelum masuk materi berikutnya.</p>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="moduleQuizPrompt = null">Nanti</button>
        <RouterLink class="primary-btn" :to="toModuleQuizRoute(moduleQuizPrompt.quiz, 'module-complete')">Mulai Quiz</RouterLink>
      </div>
    </article>
  </section>

  <div v-if="compareModalEntry" class="assignment-compare-backdrop" @click.self="closeHistoryCompare">
    <article class="assignment-compare-modal card">
      <div class="assignment-compare-head">
        <div>
          <p class="eyebrow">Revision Compare</p>
          <h3>{{ formatSubmissionAction(compareModalEntry.action) }}</h3>
        </div>
        <button type="button" class="ghost-btn" @click="closeHistoryCompare">Close</button>
      </div>

      <div class="assignment-compare-grid">
        <section>
          <h4>Previous</h4>
          <dl class="assignment-compare-fields">
            <div>
              <dt>Status</dt>
              <dd>{{ compareOldSnapshot.status || '-' }}</dd>
            </div>
            <div>
              <dt>Project Link</dt>
              <dd>{{ compareOldSnapshot.linkUrl || '-' }}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{{ compareOldSnapshot.notes || '-' }}</dd>
            </div>
            <div>
              <dt>Feedback</dt>
              <dd>{{ compareOldSnapshot.feedback || '-' }}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{{ compareOldSnapshot.scorePercent ?? '-' }}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h4>Current</h4>
          <dl class="assignment-compare-fields">
            <div>
              <dt>Status</dt>
              <dd>{{ compareNewSnapshot.status || '-' }}</dd>
            </div>
            <div>
              <dt>Project Link</dt>
              <dd>{{ compareNewSnapshot.linkUrl || '-' }}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{{ compareNewSnapshot.notes || '-' }}</dd>
            </div>
            <div>
              <dt>Feedback</dt>
              <dd>{{ compareNewSnapshot.feedback || '-' }}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{{ compareNewSnapshot.scorePercent ?? '-' }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div class="assignment-compare-rubric">
        <h4>Rubric Diff</h4>
        <div class="assignment-compare-rubric-table">
          <div class="assignment-compare-rubric-row assignment-compare-rubric-head">
            <span>Criterion</span>
            <span>Previous</span>
            <span>Current</span>
          </div>
          <div v-for="row in compareRubricRows" :key="row.id" class="assignment-compare-rubric-row">
            <span>{{ row.label }}</span>
            <span>{{ row.prevText }}</span>
            <span>{{ row.nextText }}</span>
          </div>
          <p v-if="!compareRubricRows.length" class="muted">Tidak ada perubahan rubric pada revision ini.</p>
        </div>
      </div>
    </article>
  </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { apiClient } from '../services/api/client'
import { quizCatalogService } from '../services/quizCatalogService'
import { useAuthStore } from '../stores/auth'
import { useLessonAssignmentStore } from '../stores/lessonAssignment'
import { useCoursePlayerStore } from '../stores/coursePlayer'
import { useLessonDiscussionStore } from '../stores/lessonDiscussion'
import { useLessonNotesStore } from '../stores/lessonNotes'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const toastStore = useToastStore()
const authStore = useAuthStore()
const coursePlayerStore = useCoursePlayerStore()
const discussionStore = useLessonDiscussionStore()
const assignmentStore = useLessonAssignmentStore()
const notesStore = useLessonNotesStore()
const { currentCourse, pendingPlaybackSyncCount, failedPlaybackSyncCount } = storeToRefs(coursePlayerStore)
const { items: discussionItems } = storeToRefs(discussionStore)
const { items: lessonNotes } = storeToRefs(notesStore)
const {
  assignment: lessonAssignment,
  windowStatus: assignmentWindowStatus,
  overviewByLesson: assignmentOverviewByLesson,
  mySubmission: myAssignmentSubmission,
  submissions: assignmentSubmissions,
} = storeToRefs(assignmentStore)
const { currentTemplate } = useTemplateSwitcher()

const isCompleting = ref(false)
const moduleQuizPrompt = ref(null)
const activeTab = ref('material')
const discussionDraft = ref('')
const replyTarget = ref(null)
const editingItemId = ref('')
const editDraft = ref('')
const focusDiscussionId = ref('')
const assignmentDraft = ref({
  linkUrl: '',
  notes: '',
  attachmentName: '',
  attachmentDataUrl: '',
})
const assignmentPolicyDraft = ref({
  dueAtLocal: '',
  graceMinutes: 24 * 60,
})
const assignmentBulkPolicyDraft = ref({
  dueAtLocal: '',
  graceMinutes: 24 * 60,
})
const assignmentBulkTimePreset = ref('23:59')
const assignmentAttachmentInput = ref(null)
const downloadingAttachmentId = ref('')
const lessonVideoRef = ref(null)
const isVideoSeekingFromResume = ref(false)
const autoCompleteVideoEnabled = ref(true)
const liveVideoPositionSec = ref(0)
const liveVideoDurationSec = ref(0)
const videoLoadErrorTitle = ref('')
const videoLoadErrorDetail = ref('')
const autoCompletingLessonId = ref('')
const reviewDraftById = ref({})
const assignmentReviewFilter = ref('all')
const assignmentOverviewModuleFilter = ref('all')
const selectedOverviewLessonIds = ref([])
const compareModalEntry = ref(null)
const noteDraftText = ref('')
const noteDraftTimestampSec = ref(0)
const editingNoteId = ref('')
const transcriptQuery = ref('')
const prerequisiteEditorModuleId = ref('')
const prerequisiteEditorMode = ref('all')
const prerequisiteEditorRules = ref([])
const isSavingPrerequisite = ref(false)
let focusResetTimer = null
let playbackSaveTimer = null
let lastPlaybackSavedAt = 0
const fallbackGradient = 'linear-gradient(145deg, #1f6feb, #53b3ff)'
const AUTO_COMPLETE_VIDEO_KEY = 'curiosity:lms:auto-complete-video:v1'
const mentionDirectory = [
  { id: 'u-001', handle: 'indra', name: 'Indra Permana' },
  { id: 'u-002', handle: 'ayu', name: 'Ayu Pratama' },
  { id: 'u-003', handle: 'raka', name: 'Raka Wijaya' },
  { id: 'u-004', handle: 'nadia', name: 'Nadia Putri' },
]

const activeLesson = computed(() => currentCourse.value?.activeLesson || null)
const activeLessonResources = computed(() => (Array.isArray(activeLesson.value?.resources) ? activeLesson.value.resources : []))
const canCompleteActiveLesson = computed(() => {
  const lesson = activeLesson.value
  if (!lesson) return false
  if (lesson.type === 'video' && lesson.canComplete === false) {
    const required = Number(lesson.completionRequiredPercent || 90)
    return displayVideoProgressPercent.value >= required
  }
  return lesson.canComplete !== false
})
const activeLessonCompletionHint = computed(() => {
  const lesson = activeLesson.value
  if (!lesson || lesson.canComplete !== false) return ''
  const required = Number(lesson.completionRequiredPercent || 90)
  const current = lesson.type === 'video' ? displayVideoProgressPercent.value : Number(lesson.playback?.progressPercent || 0)
  return lesson.completionGateReason || `Tonton minimal ${required}% (saat ini ${current}%).`
})
const displayVideoResumeSec = computed(() => {
  const lesson = activeLesson.value
  if (!lesson || lesson.type !== 'video') return Math.max(0, Math.floor(Number(lesson?.playback?.positionSec || 0)))
  const fallback = Math.max(0, Math.floor(Number(lesson.playback?.positionSec || 0)))
  return Math.max(fallback, liveVideoPositionSec.value)
})
const displayVideoProgressPercent = computed(() => {
  const lesson = activeLesson.value
  if (!lesson || lesson.type !== 'video') return Math.max(0, Math.min(100, Math.round(Number(lesson?.playback?.progressPercent || 0))))
  const fallback = Math.max(0, Math.min(100, Math.round(Number(lesson.playback?.progressPercent || 0))))
  const duration = Math.max(0, Math.floor(Number(liveVideoDurationSec.value || lesson.playback?.durationSec || 0)))
  if (duration <= 0) return fallback
  const live = Math.max(0, Math.min(100, Math.round((Math.max(0, liveVideoPositionSec.value) / duration) * 100)))
  return Math.max(fallback, live)
})
const previousLesson = computed(() => currentCourse.value?.previousLesson || null)
const nextLesson = computed(() => currentCourse.value?.nextLesson || null)
const authUser = computed(() => authStore.user || null)
const isAssignmentReviewer = computed(() => ['admin', 'instructor'].includes(String(authUser.value?.role || '')))
const canSubmitAssignment = computed(() => String(authUser.value?.role || '') === 'student')
const assignmentItems = computed(() => (isAssignmentReviewer.value ? assignmentSubmissions.value : []))
const filteredAssignmentItems = computed(() => {
  if (assignmentReviewFilter.value === 'all') return assignmentItems.value
  return assignmentItems.value.filter((item) => String(item.status || '') === assignmentReviewFilter.value)
})
const mentionQuery = computed(() => {
  const match = String(discussionDraft.value || '').match(/(?:^|\s)@([a-zA-Z0-9._-]{0,30})$/)
  return match ? match[1].toLowerCase() : ''
})
const mentionSuggestions = computed(() => {
  const query = mentionQuery.value
  if (!query) return []
  return mentionDirectory
    .filter(
      (user) =>
        user.handle.toLowerCase().includes(query) ||
        user.name.toLowerCase().replace(/\s+/g, '').includes(query),
    )
    .slice(0, 6)
})
const canSaveNoteDraft = computed(
  () =>
    Number.isFinite(Number(noteDraftTimestampSec.value)) &&
    Number(noteDraftTimestampSec.value) >= 0 &&
    String(noteDraftText.value || '').trim().length > 0,
)
const noteDraftTimestampInput = computed({
  get: () => formatSeconds(noteDraftTimestampSec.value),
  set: (value) => {
    noteDraftTimestampSec.value = parseTimestampInput(value)
  },
})
const filteredTranscriptRows = computed(() => {
  const rows = Array.isArray(activeLesson.value?.transcript) ? activeLesson.value.transcript : []
  const query = String(transcriptQuery.value || '').trim().toLowerCase()
  if (!query) return rows
  return rows.filter((row) => String(row.text || '').toLowerCase().includes(query))
})
const threadedDiscussions = computed(() => {
  const roots = discussionItems.value.filter((item) => !item.parentId)
  return roots.map((root) => ({
    root,
    replies: discussionItems.value.filter((item) => item.parentId === root.id),
  }))
})

const assignmentStatusLabel = (status) => {
  if (status === 'graded') return 'Graded'
  if (status === 'revised') return 'Need Revision'
  return 'Submitted'
}

const assignmentStatusClass = (status) => {
  if (status === 'graded') return 'is-graded'
  if (status === 'revised') return 'is-revised'
  return 'is-submitted'
}

const hasAttachment = computed(() => Boolean(assignmentDraft.value.attachmentDataUrl))
const isSubmissionClosed = computed(() => Boolean(assignmentWindowStatus.value?.isClosed))
const isLateWindow = computed(() => Boolean(assignmentWindowStatus.value?.isLateWindow))
const assignmentDueLabel = computed(() => {
  const dueAt = assignmentWindowStatus.value?.dueAt
  if (!dueAt) return '-'
  return formatDiscussionTime(dueAt)
})
const assignmentWindowLabel = computed(() => {
  if (!assignmentWindowStatus.value?.hasDeadline) return 'No deadline'
  if (isSubmissionClosed.value) return 'Submission Closed'
  if (isLateWindow.value) return `Late Window (+${assignmentWindowStatus.value?.lateByMinutes || 0} min)`
  return 'On-time Window'
})

const getLessonDeadlineConfig = (lesson) => ({
  dueAt: lesson?.assignment?.dueAt || '2026-03-31T16:59:00.000Z',
  graceMinutes: Number(lesson?.assignment?.graceMinutes || 24 * 60),
})

const computeWindowFromConfig = (dueAtIso, graceMinutes, nowMs) => {
  const dueAtMs = dueAtIso ? Date.parse(dueAtIso) : Number.NaN
  if (!Number.isFinite(dueAtMs)) {
    return { label: 'No deadline', className: 'is-submitted' }
  }
  const graceMs = Math.max(0, Number(graceMinutes || 0)) * 60 * 1000
  if (nowMs > dueAtMs + graceMs) {
    return { label: 'Closed', className: 'is-revised' }
  }
  if (nowMs > dueAtMs) {
    return { label: 'Late Window', className: 'is-revised' }
  }
  return { label: 'On-time', className: 'is-graded' }
}

const assignmentOverviewRows = computed(() => {
  const modules = currentCourse.value?.modules || []
  const nowMs = Date.parse(assignmentStore.serverTime || '') || Date.now()
  return modules.flatMap((module) =>
    (module.lessons || []).map((lesson) => {
      const overview = assignmentOverviewByLesson.value?.[lesson.id] || null
      const config = overview
        ? {
            dueAt: overview.dueAt || null,
            graceMinutes: Number(overview.graceMinutes || 0),
          }
        : getLessonDeadlineConfig(lesson)
      const status = overview?.windowStatus
        ? computeWindowFromConfig(config.dueAt, config.graceMinutes, nowMs)
        : computeWindowFromConfig(config.dueAt, config.graceMinutes, nowMs)
      return {
        id: lesson.id,
        moduleId: module.id,
        moduleTitle: module.title,
        lessonTitle: lesson.title,
        dueAt: config.dueAt,
        graceMinutes: config.graceMinutes,
        statusLabel: status.label,
        statusClass: status.className,
      }
    }),
  )
})

const assignmentOverviewModuleOptions = computed(() =>
  (currentCourse.value?.modules || []).map((module) => ({
    id: module.id,
    title: module.title,
  })),
)
const prerequisiteModuleOptions = computed(() =>
  (currentCourse.value?.modules || [])
    .map((module, index) => ({
      id: module.id,
      title: module.title,
      index,
    }))
    .filter((module) => module.index > 0),
)
const prerequisiteRuleModuleOptions = computed(() =>
  (currentCourse.value?.modules || []).map((module) => ({
    id: module.id,
    title: module.title,
  })),
)
const prerequisiteRuleLessonOptions = computed(() =>
  (currentCourse.value?.modules || []).flatMap((module) =>
    (module.lessons || []).map((lesson) => ({
      id: lesson.id,
      title: `${module.title} · ${lesson.title}`,
    })),
  ),
)
const selectedPrerequisiteModule = computed(
  () => (currentCourse.value?.modules || []).find((module) => module.id === prerequisiteEditorModuleId.value) || null,
)
const canConfigurePrerequisite = computed(() => isAssignmentReviewer.value && prerequisiteModuleOptions.value.length > 0)
const prerequisiteModuleIndexById = computed(() =>
  Object.fromEntries((currentCourse.value?.modules || []).map((module, index) => [module.id, index])),
)
const prerequisiteLessonMetaById = computed(() =>
  Object.fromEntries(
    (currentCourse.value?.modules || []).flatMap((module, moduleIndex) =>
      (module.lessons || []).map((lesson) => [
        lesson.id,
        {
          id: lesson.id,
          title: lesson.title,
          moduleId: module.id,
          moduleTitle: module.title,
          moduleIndex,
        },
      ]),
    ),
  ),
)
const prerequisiteRuleDiagnostics = computed(() => {
  const targetModuleId = prerequisiteEditorModuleId.value
  const targetIndex = prerequisiteModuleIndexById.value[targetModuleId] ?? -1
  const modules = prerequisiteRuleModuleOptions.value
  const lessons = prerequisiteLessonMetaById.value
  return prerequisiteEditorRules.value.map((rule) => {
    if (rule.type === 'lesson-complete') {
      const lesson = lessons[rule.lessonId]
      if (!lesson) {
        return { state: 'error', message: 'Lesson referensi tidak valid.' }
      }
      if (lesson.moduleId === targetModuleId) {
        return { state: 'error', message: 'Rule tidak boleh mereferensikan lesson di module yang sama.' }
      }
      if (lesson.moduleIndex >= targetIndex) {
        return { state: 'warning', message: 'Gunakan lesson dari module sebelumnya agar unlock lebih konsisten.' }
      }
      return { state: 'ok', message: '' }
    }

    const selectedModule = modules.find((item) => item.id === rule.moduleId)
    if (!selectedModule) {
      return { state: 'error', message: 'Module referensi tidak valid.' }
    }
    if (rule.moduleId === targetModuleId) {
      return { state: 'error', message: 'Rule tidak boleh mereferensikan module yang sama.' }
    }
    const sourceIndex = prerequisiteModuleIndexById.value[rule.moduleId] ?? -1
    if (sourceIndex >= targetIndex) {
      return { state: 'warning', message: 'Sebaiknya referensi module sebelum target module.' }
    }
    return { state: 'ok', message: '' }
  })
})
const prerequisiteInvalidCount = computed(
  () => prerequisiteRuleDiagnostics.value.filter((item) => item.state === 'error').length,
)
const prerequisiteWarningCount = computed(
  () => prerequisiteRuleDiagnostics.value.filter((item) => item.state === 'warning').length,
)
const normalizedEditorPrerequisitePayload = computed(() => ({
  mode: prerequisiteEditorMode.value === 'any' ? 'any' : 'all',
  rules: prerequisiteEditorRules.value
    .map((rule) => ({
      type: rule.type,
      moduleId: rule.type === 'lesson-complete' ? undefined : String(rule.moduleId || ''),
      lessonId: rule.type === 'lesson-complete' ? String(rule.lessonId || '') : undefined,
    }))
    .filter((rule) => (rule.type === 'lesson-complete' ? Boolean(rule.lessonId) : Boolean(rule.moduleId))),
}))
const hasPrerequisiteChanges = computed(() => {
  const source = selectedPrerequisiteModule.value?.prerequisite || {
    mode: 'all',
    rules: getDefaultPrerequisiteRules(prerequisiteEditorModuleId.value),
  }
  const normalize = (payload) => ({
    mode: payload?.mode === 'any' ? 'any' : 'all',
    rules: (Array.isArray(payload?.rules) ? payload.rules : [])
      .map((rule) => ({
        type: rule?.type === 'lesson-complete' ? 'lesson-complete' : rule?.type === 'module-quiz-pass' ? 'module-quiz-pass' : 'module-complete',
        moduleId: rule?.type === 'lesson-complete' ? undefined : String(rule?.moduleId || ''),
        lessonId: rule?.type === 'lesson-complete' ? String(rule?.lessonId || '') : undefined,
      }))
      .filter((rule) => (rule.type === 'lesson-complete' ? Boolean(rule.lessonId) : Boolean(rule.moduleId))),
  })
  return JSON.stringify(normalize(source)) !== JSON.stringify(normalize(normalizedEditorPrerequisitePayload.value))
})
const canSavePrerequisite = computed(
  () =>
    canConfigurePrerequisite.value &&
    prerequisiteInvalidCount.value === 0 &&
    hasPrerequisiteChanges.value &&
    !isSavingPrerequisite.value,
)

const filteredAssignmentOverviewRows = computed(() => {
  if (assignmentOverviewModuleFilter.value === 'all') return assignmentOverviewRows.value
  return assignmentOverviewRows.value.filter((row) => row.moduleId === assignmentOverviewModuleFilter.value)
})

const allVisibleOverviewSelected = computed(() => {
  const visibleIds = filteredAssignmentOverviewRows.value.map((row) => row.id)
  if (!visibleIds.length) return false
  const selected = new Set(selectedOverviewLessonIds.value)
  return visibleIds.every((id) => selected.has(id))
})

const toLocalDateTimeInput = (isoValue) => {
  if (!isoValue) return ''
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const fromLocalDateTimeInput = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

const toSafeDownloadName = (value) =>
  String(value || 'attachment')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'attachment'

const downloadDataUrl = (dataUrl, fileName) => {
  if (!dataUrl) return
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = toSafeDownloadName(fileName)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

const formatSeconds = (value) => {
  const total = Math.max(0, Math.floor(Number(value || 0)))
  const minute = Math.floor(total / 60)
  const second = total % 60
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

const parseTimestampInput = (value) => {
  const text = String(value || '').trim()
  if (!text) return 0
  if (/^\d+$/.test(text)) return Math.max(0, Math.floor(Number(text)))
  const parts = text.split(':').map((part) => part.trim())
  if (!parts.length || parts.some((part) => !/^\d+$/.test(part))) return 0
  if (parts.length === 2) {
    const minute = Number(parts[0] || 0)
    const second = Number(parts[1] || 0)
    return Math.max(0, minute * 60 + second)
  }
  if (parts.length === 3) {
    const hour = Number(parts[0] || 0)
    const minute = Number(parts[1] || 0)
    const second = Number(parts[2] || 0)
    return Math.max(0, hour * 3600 + minute * 60 + second)
  }
  return 0
}

const formatBytes = (value) => {
  const bytes = Math.max(0, Number(value || 0))
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes)} B`
}

const downloadLessonResource = (resource) => {
  if (!resource?.dataUrl) return
  downloadDataUrl(resource.dataUrl, resource.fileName || resource.title || 'resource.txt')
}

const downloadActiveLessonArticleAttachment = async () => {
  const lesson = activeLesson.value
  if (!lesson) return
  if (lesson.articleAttachmentDataUrl) {
    downloadDataUrl(lesson.articleAttachmentDataUrl, lesson.articleAttachmentName || 'article-attachment')
    return
  }
  const uploadId = String(lesson.articleAttachmentId || '').trim()
  if (!uploadId || !apiClient.courses?.getAttachmentData) return
  try {
    const payload = await apiClient.courses.getAttachmentData(uploadId)
    const dataUrl = String(payload?.dataUrl || '')
    if (!dataUrl) throw new Error('Attachment data kosong.')
    downloadDataUrl(dataUrl, lesson.articleAttachmentName || payload?.fileName || 'article-attachment')
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal download article',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const seekToTimestamp = (sec) => {
  if (!lessonVideoRef.value) return
  const target = Math.max(0, Math.floor(Number(sec || 0)))
  try {
    lessonVideoRef.value.currentTime = target
    schedulePlaybackFlush(true)
  } catch {
    // no-op
  }
}

const setNoteTimestampFromCurrent = () => {
  noteDraftTimestampSec.value = Math.max(0, Math.floor(Number(lessonVideoRef.value?.currentTime || 0)))
}

const syncVideoLiveMetrics = () => {
  if (!lessonVideoRef.value) return
  const position = Math.max(0, Math.floor(Number(lessonVideoRef.value.currentTime || 0)))
  const durationRaw = Number(lessonVideoRef.value.duration || 0)
  const duration = Number.isFinite(durationRaw) ? Math.max(0, Math.floor(durationRaw)) : 0
  liveVideoPositionSec.value = position
  liveVideoDurationSec.value = duration
}

const syncNoteTimestampFromVideo = () => {
  if (!lessonVideoRef.value) return
  noteDraftTimestampSec.value = Math.max(0, Math.floor(Number(lessonVideoRef.value.currentTime || 0)))
}

const readAutoCompleteVideoPreference = () => {
  if (typeof localStorage === 'undefined') return true
  const raw = localStorage.getItem(AUTO_COMPLETE_VIDEO_KEY)
  if (raw === '0') return false
  if (raw === '1') return true
  return true
}

const writeAutoCompleteVideoPreference = (enabled) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AUTO_COMPLETE_VIDEO_KEY, enabled ? '1' : '0')
}

const flushPlayback = async (markCompleted = false, force = false) => {
  if (!activeLesson.value || !lessonVideoRef.value) return
  const positionSec = Math.floor(Number(lessonVideoRef.value.currentTime || 0))
  const durationSec = Number.isFinite(lessonVideoRef.value.duration) ? Math.floor(Number(lessonVideoRef.value.duration || 0)) : 0
  if (!markCompleted && !force && positionSec <= 0) return

  const nowMs = Date.now()
  if (!markCompleted && !force && nowMs - lastPlaybackSavedAt < 2500) return

  try {
    await coursePlayerStore.saveLessonPlayback(String(route.params.id), activeLesson.value.id, {
      positionSec,
      durationSec,
      markCompleted,
    })
    lastPlaybackSavedAt = nowMs
  } catch {
    // keep silent to avoid noisy toast while user is watching
  }
}

const schedulePlaybackFlush = (force = false) => {
  if (playbackSaveTimer) {
    clearTimeout(playbackSaveTimer)
    playbackSaveTimer = null
  }
  playbackSaveTimer = setTimeout(() => {
    flushPlayback(false, force)
    playbackSaveTimer = null
  }, force ? 0 : 700)
}

const onVideoLoadedMetadata = () => {
  videoLoadErrorTitle.value = ''
  videoLoadErrorDetail.value = ''
  syncVideoLiveMetrics()
  syncNoteTimestampFromVideo()
  if (!lessonVideoRef.value || !activeLesson.value) return
  const resumeAtSec = Math.floor(Number(activeLesson.value.playback?.positionSec || 0))
  if (!resumeAtSec || resumeAtSec < 2) return
  const durationSec = Number.isFinite(lessonVideoRef.value.duration) ? Math.floor(Number(lessonVideoRef.value.duration || 0)) : 0
  const safeResume = durationSec > 2 ? Math.min(resumeAtSec, durationSec - 1) : resumeAtSec
  try {
    isVideoSeekingFromResume.value = true
    lessonVideoRef.value.currentTime = Math.max(0, safeResume)
    setTimeout(() => {
      isVideoSeekingFromResume.value = false
    }, 300)
  } catch {
    isVideoSeekingFromResume.value = false
  }
}

const onVideoLoadStart = () => {
  videoLoadErrorTitle.value = ''
  videoLoadErrorDetail.value = ''
  syncVideoLiveMetrics()
  syncNoteTimestampFromVideo()
}

const onVideoPlay = () => {
  syncVideoLiveMetrics()
  syncNoteTimestampFromVideo()
}

const inferVideoIssue = (src, mediaErrorCode) => {
  const source = String(src || '').trim()
  if (!source) {
    return {
      title: 'Video URL kosong',
      detail: 'Isi URL video langsung (direct file) pada lesson type Video.',
    }
  }
  const lower = source.toLowerCase()
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && lower.startsWith('http://')) {
    return {
      title: 'Mixed Content diblokir browser',
      detail: 'Aplikasi berjalan di HTTPS, tapi URL video masih HTTP. Gunakan URL HTTPS.',
    }
  }
  const likelyOwnCloudSharePage =
    (lower.includes('/index.php/s/') || lower.includes('/s/')) &&
    !lower.includes('/download') &&
    !lower.includes('/files=')
  if (likelyOwnCloudSharePage) {
    return {
      title: 'Link ownCloud belum direct video',
      detail: 'Gunakan link download langsung, contoh: .../index.php/s/<token>/download?path=%2F&files=video.mp4',
    }
  }
  const looksLikeVideoFile = /\.(mp4|webm|ogg|m3u8)(\?|#|$)/i.test(source) || lower.includes('/download')
  if (!looksLikeVideoFile) {
    return {
      title: 'URL bukan file video langsung',
      detail: 'URL sebaiknya menunjuk langsung ke file video (mp4/webm/ogg) atau endpoint download.',
    }
  }
  if (mediaErrorCode === 2) {
    return {
      title: 'Network error saat memuat video',
      detail: 'Cek koneksi atau izin akses link video (public permission).',
    }
  }
  if (mediaErrorCode === 4) {
    return {
      title: 'Format/akses video tidak didukung',
      detail: 'Pastikan server kirim Content-Type video/*, mendukung byte-range, CORS diizinkan, dan codec H.264/AAC.',
    }
  }
  return {
    title: 'Video gagal dimuat',
    detail: 'Periksa URL direct video, permission public link, dan konfigurasi CORS server.',
  }
}

const onVideoError = (event) => {
  const target = event?.target
  const mediaErrorCode = Number(target?.error?.code || 0)
  const source = String(target?.currentSrc || activeLesson.value?.videoUrl || '')
  const issue = inferVideoIssue(source, mediaErrorCode)
  videoLoadErrorTitle.value = issue.title
  videoLoadErrorDetail.value = issue.detail
}

const openVideoSourceInNewTab = () => {
  const source = String(lessonVideoRef.value?.currentSrc || activeLesson.value?.videoUrl || '').trim()
  if (!source) return
  window.open(source, '_blank', 'noopener,noreferrer')
}

const onVideoTimeUpdate = () => {
  if (isVideoSeekingFromResume.value) return
  syncVideoLiveMetrics()
  syncNoteTimestampFromVideo()
  schedulePlaybackFlush(false)
  tryAutoCompleteByVideoProgress()
}

const onVideoPause = () => {
  syncVideoLiveMetrics()
  syncNoteTimestampFromVideo()
  schedulePlaybackFlush(true)
}

const onVideoEnded = async () => {
  syncVideoLiveMetrics()
  syncNoteTimestampFromVideo()
  await flushPlayback(true, true)
  tryAutoCompleteByVideoProgress()
}

const tryAutoCompleteByVideoProgress = async () => {
  if (!autoCompleteVideoEnabled.value) return
  if (!activeLesson.value || !lessonVideoRef.value) return
  if (activeLesson.value.type !== 'video') return
  if (activeLesson.value.isCompleted) return
  if (isCompleting.value) return
  if (autoCompletingLessonId.value === activeLesson.value.id) return

  const required = Number(activeLesson.value.completionRequiredPercent || 90)
  const durationSec = Number(lessonVideoRef.value.duration || 0)
  if (!Number.isFinite(durationSec) || durationSec <= 0) return
  const currentSec = Math.max(0, Number(lessonVideoRef.value.currentTime || 0))
  const progress = Math.round((currentSec / durationSec) * 100)
  if (progress < required) return

  autoCompletingLessonId.value = activeLesson.value.id
  try {
    await flushPlayback(true, true)
    if (!canCompleteActiveLesson.value) return
    await markComplete()
  } finally {
    autoCompletingLessonId.value = ''
  }
}

const getSubmissionHistory = (submission) => (Array.isArray(submission?.history) ? submission.history : [])

const formatSubmissionAction = (action) => {
  if (action === 'reviewed') return 'Reviewed by instructor'
  if (action === 'resubmitted') return 'Resubmitted by student'
  return 'Updated'
}

const summarizeHistoryDiff = (entry) => {
  const next = entry?.snapshot || {}
  const prev = entry?.previousSnapshot || {}
  const changes = []
  if ((prev.status || '') !== (next.status || '')) {
    changes.push(`status: ${prev.status || 'n/a'} -> ${next.status || 'n/a'}`)
  }
  if ((prev.linkUrl || '') !== (next.linkUrl || '')) {
    changes.push('project link updated')
  }
  if ((prev.notes || '') !== (next.notes || '')) {
    changes.push('notes updated')
  }
  if ((prev.feedback || '') !== (next.feedback || '')) {
    changes.push('feedback updated')
  }
  if ((prev.scorePercent ?? null) !== (next.scorePercent ?? null)) {
    changes.push(`score: ${prev.scorePercent ?? '-'} -> ${next.scorePercent ?? '-'}`)
  }
  return changes.length ? changes.join(' · ') : 'No visible change summary'
}

const compareOldSnapshot = computed(() => compareModalEntry.value?.previousSnapshot || {})
const compareNewSnapshot = computed(() => compareModalEntry.value?.snapshot || {})

const compareRubricRows = computed(() => {
  const oldRubric = Array.isArray(compareOldSnapshot.value?.rubricScores) ? compareOldSnapshot.value.rubricScores : []
  const newRubric = Array.isArray(compareNewSnapshot.value?.rubricScores) ? compareNewSnapshot.value.rubricScores : []
  const oldMap = new Map(oldRubric.map((item) => [item.criterionId, item]))
  const newMap = new Map(newRubric.map((item) => [item.criterionId, item]))
  const rubricCatalog = Array.isArray(lessonAssignment.value?.rubric) ? lessonAssignment.value.rubric : []
  const knownIds = rubricCatalog.map((item) => item.id)
  const allIds = [...new Set([...knownIds, ...oldMap.keys(), ...newMap.keys()])]
  return allIds
    .map((id) => {
      const oldItem = oldMap.get(id) || null
      const newItem = newMap.get(id) || null
      const oldText = oldItem ? `${oldItem.score}${oldItem.comment ? ` (${oldItem.comment})` : ''}` : '-'
      const newText = newItem ? `${newItem.score}${newItem.comment ? ` (${newItem.comment})` : ''}` : '-'
      return {
        id,
        label: rubricCatalog.find((item) => item.id === id)?.label || id,
        prevText: oldText,
        nextText: newText,
      }
    })
    .filter((row) => row.prevText !== row.nextText)
})

const openHistoryCompare = (entry) => {
  compareModalEntry.value = entry || null
}

const closeHistoryCompare = () => {
  compareModalEntry.value = null
}

const handleGlobalKeyDown = (event) => {
  if (event.key === 'Escape' && compareModalEntry.value) {
    closeHistoryCompare()
  }
}

const getLessonModule = (course, lessonId) =>
  course?.modules?.find((module) => module.lessons.some((lesson) => lesson.id === lessonId)) || null

const isModuleCompleted = (module) => module.lessons.every((lesson) => lesson.isCompleted)

const getModuleQuiz = (moduleId) => quizCatalogService.getQuizForModule(String(route.params.id), moduleId)

const getModuleGateStatus = (module) => {
  const modules = currentCourse.value?.modules || []
  const currentIndex = modules.findIndex((item) => item.id === module?.id)
  if (currentIndex <= 0) {
    return { required: false, passed: true }
  }
  const prevModule = modules[currentIndex - 1]
  const prevModuleQuiz = prevModule ? getModuleQuiz(prevModule.id) : null
  if (!prevModuleQuiz) {
    return { required: false, passed: true }
  }
  const firstLesson = module?.lessons?.[0] || null
  const reason = String(firstLesson?.lockReason || '')
  const blockedByQuiz = /quiz|lulus|pass/i.test(reason)
  return {
    required: true,
    passed: !blockedByQuiz,
  }
}

const toModuleQuizRoute = (quiz, source) => ({
  name: 'quiz',
  params: { id: quiz.id },
  query: {
    course: String(route.params.id),
    module: quiz.moduleId,
    source,
  },
})

const toLessonQuizRoute = (quizId) => ({
  name: 'quiz',
  params: { id: String(quizId || '') },
  query: {
    course: String(route.params.id),
    lesson: String(activeLesson.value?.id || ''),
    source: 'lesson-quiz',
  },
})

const createPrerequisiteRuleId = () => `pr-rule-${Math.random().toString(36).slice(2, 10)}`

const getPreviousModuleId = (moduleId) => {
  const modules = currentCourse.value?.modules || []
  const index = modules.findIndex((module) => module.id === moduleId)
  if (index <= 0) return modules[0]?.id || ''
  return modules[index - 1]?.id || modules[0]?.id || ''
}

const getDefaultPrerequisiteRules = (moduleId) => {
  const prevModuleId = getPreviousModuleId(moduleId)
  const fallback = []
  if (prevModuleId) {
    fallback.push({ type: 'module-complete', moduleId: prevModuleId })
    if (getModuleQuiz(prevModuleId)) {
      fallback.push({ type: 'module-quiz-pass', moduleId: prevModuleId })
    }
  }
  return fallback
}

const getLastLessonIdInModule = (moduleId) => {
  const module = (currentCourse.value?.modules || []).find((item) => item.id === moduleId)
  if (!module || !Array.isArray(module.lessons) || !module.lessons.length) return ''
  return module.lessons[module.lessons.length - 1]?.id || ''
}

const normalizePrerequisiteRules = (rules, moduleId) => {
  const moduleOptions = prerequisiteRuleModuleOptions.value
  const lessonOptions = prerequisiteRuleLessonOptions.value
  const fallbackModuleId = getPreviousModuleId(moduleId) || moduleOptions[0]?.id || ''
  const fallbackLessonId = lessonOptions[0]?.id || ''
  const source = Array.isArray(rules) && rules.length ? rules : getDefaultPrerequisiteRules(moduleId)
  const normalized = source
    .map((rule) => {
      const type = rule?.type === 'lesson-complete'
        ? 'lesson-complete'
        : rule?.type === 'module-quiz-pass'
          ? 'module-quiz-pass'
          : 'module-complete'
      if (type === 'lesson-complete') {
        const lessonId = lessonOptions.some((item) => item.id === rule?.lessonId) ? rule.lessonId : fallbackLessonId
        if (!lessonId) return null
        return { id: createPrerequisiteRuleId(), type, moduleId: '', lessonId }
      }
      const moduleIdValue = moduleOptions.some((item) => item.id === rule?.moduleId) ? rule.moduleId : fallbackModuleId
      if (!moduleIdValue) return null
      return { id: createPrerequisiteRuleId(), type, moduleId: moduleIdValue, lessonId: '' }
    })
    .filter(Boolean)
  return normalized.length ? normalized : [{ id: createPrerequisiteRuleId(), type: 'module-complete', moduleId: fallbackModuleId, lessonId: '' }]
}

const hydratePrerequisiteEditor = (moduleId = prerequisiteEditorModuleId.value) => {
  const targetModuleId = moduleId || prerequisiteModuleOptions.value[0]?.id || ''
  prerequisiteEditorModuleId.value = targetModuleId
  const module = (currentCourse.value?.modules || []).find((item) => item.id === targetModuleId)
  const source = module?.prerequisite || {
    mode: 'all',
    rules: getDefaultPrerequisiteRules(targetModuleId),
  }
  prerequisiteEditorMode.value = source.mode === 'any' ? 'any' : 'all'
  prerequisiteEditorRules.value = normalizePrerequisiteRules(source.rules, targetModuleId)
}

const onPrerequisiteRuleTypeChange = (rule) => {
  if (!rule) return
  if (rule.type === 'lesson-complete') {
    rule.moduleId = ''
    if (!rule.lessonId) {
      rule.lessonId = prerequisiteRuleLessonOptions.value[0]?.id || ''
    }
    return
  }
  rule.lessonId = ''
  if (!rule.moduleId) {
    rule.moduleId = getPreviousModuleId(prerequisiteEditorModuleId.value) || prerequisiteRuleModuleOptions.value[0]?.id || ''
  }
}

const addPrerequisiteRule = (type) => {
  const fallbackModuleId = getPreviousModuleId(prerequisiteEditorModuleId.value) || prerequisiteRuleModuleOptions.value[0]?.id || ''
  const fallbackLessonId = prerequisiteRuleLessonOptions.value[0]?.id || ''
  prerequisiteEditorRules.value = [
    ...prerequisiteEditorRules.value,
    {
      id: createPrerequisiteRuleId(),
      type,
      moduleId: type === 'lesson-complete' ? '' : fallbackModuleId,
      lessonId: type === 'lesson-complete' ? fallbackLessonId : '',
    },
  ]
}

const removePrerequisiteRule = (ruleId) => {
  prerequisiteEditorRules.value = prerequisiteEditorRules.value.filter((rule) => rule.id !== ruleId)
  if (!prerequisiteEditorRules.value.length) {
    addPrerequisiteRule('module-complete')
  }
}

const applyPrerequisitePreset = (preset) => {
  const targetModuleId = prerequisiteEditorModuleId.value
  if (!targetModuleId) return
  const prevModuleId = getPreviousModuleId(targetModuleId)
  const fallbackRules = normalizePrerequisiteRules(getDefaultPrerequisiteRules(targetModuleId), targetModuleId)
  if (preset === 'sequential-default') {
    prerequisiteEditorMode.value = 'all'
    prerequisiteEditorRules.value = fallbackRules
    return
  }
  if (preset === 'quiz-first') {
    const rules = []
    if (prevModuleId && getModuleQuiz(prevModuleId)) {
      rules.push({ type: 'module-quiz-pass', moduleId: prevModuleId })
    } else if (prevModuleId) {
      rules.push({ type: 'module-complete', moduleId: prevModuleId })
    }
    prerequisiteEditorMode.value = 'all'
    prerequisiteEditorRules.value = normalizePrerequisiteRules(rules, targetModuleId)
    return
  }
  if (preset === 'fast-track') {
    const rules = []
    if (prevModuleId) {
      rules.push({ type: 'module-complete', moduleId: prevModuleId })
      const lastPrevLesson = getLastLessonIdInModule(prevModuleId)
      if (lastPrevLesson) {
        rules.push({ type: 'lesson-complete', lessonId: lastPrevLesson })
      }
    }
    prerequisiteEditorMode.value = 'any'
    prerequisiteEditorRules.value = normalizePrerequisiteRules(rules, targetModuleId)
  }
}

const saveModulePrerequisite = async () => {
  if (!prerequisiteEditorModuleId.value || prerequisiteInvalidCount.value > 0) return
  isSavingPrerequisite.value = true
  try {
    await coursePlayerStore.updateModulePrerequisite(
      String(route.params.id),
      prerequisiteEditorModuleId.value,
      normalizedEditorPrerequisitePayload.value,
    )
    hydratePrerequisiteEditor(prerequisiteEditorModuleId.value)
    toastStore.push({
      type: 'success',
      title: 'Prerequisite disimpan',
      message: 'Aturan lock/unlock module berhasil diperbarui.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menyimpan prerequisite',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  } finally {
    isSavingPrerequisite.value = false
  }
}

const formatDiscussionTime = (value) => {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

const loadDiscussion = async () => {
  if (!activeLesson.value) return
  try {
    await discussionStore.load(String(route.params.id), activeLesson.value.id)
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat diskusi',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const loadNotes = async () => {
  if (!activeLesson.value) return
  try {
    await notesStore.load(String(route.params.id), activeLesson.value.id)
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat catatan',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const hydrateAssignmentDraft = () => {
  const mine = myAssignmentSubmission.value
  assignmentDraft.value = {
    linkUrl: mine?.linkUrl || '',
    notes: mine?.notes || '',
    attachmentName: mine?.attachmentName || '',
    attachmentDataUrl: mine?.attachmentDataUrl || '',
  }
}

const hydrateAssignmentPolicy = () => {
  assignmentPolicyDraft.value = {
    dueAtLocal: toLocalDateTimeInput(lessonAssignment.value?.dueAt || ''),
    graceMinutes: Number(lessonAssignment.value?.graceMinutes || 24 * 60),
  }
  assignmentBulkPolicyDraft.value = {
    dueAtLocal: toLocalDateTimeInput(lessonAssignment.value?.dueAt || ''),
    graceMinutes: Number(lessonAssignment.value?.graceMinutes || 24 * 60),
  }
}

const ensureReviewDraft = (submission) => {
  if (!submission?.id) return
  const rubricMap = Object.fromEntries((submission.rubricScores || []).map((item) => [item.criterionId, String(item.score)]))
  const rubricCommentMap = Object.fromEntries((submission.rubricScores || []).map((item) => [item.criterionId, String(item.comment || '')]))
  reviewDraftById.value[submission.id] = {
    status: submission.status === 'revised' ? 'revised' : 'graded',
    feedback: submission.feedback || '',
    rubric: rubricMap,
    rubricComment: rubricCommentMap,
  }
}

const loadAssignment = async () => {
  if (!activeLesson.value) return
  try {
    await assignmentStore.load(String(route.params.id), activeLesson.value.id)
    hydrateAssignmentDraft()
    hydrateAssignmentPolicy()
    assignmentItems.value.forEach((item) => ensureReviewDraft(item))
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat assignment',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const refreshAssignmentOverview = async () => {
  if (!isAssignmentReviewer.value) return
  const lessonIds = (currentCourse.value?.modules || []).flatMap((module) => module.lessons.map((lesson) => lesson.id))
  if (!lessonIds.length) return
  try {
    await assignmentStore.loadOverview(String(route.params.id), lessonIds)
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat overview deadline',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const applyTabFromQuery = () => {
  const tab = String(route.query.tab || '')
  if (tab === 'material' || tab === 'resources' || tab === 'discussion' || tab === 'assignment') {
    activeTab.value = tab
  }
}

const focusDiscussionFromQuery = async () => {
  const targetId = String(route.query.focusDiscussion || '')
  if (!targetId) {
    focusDiscussionId.value = ''
    return
  }

  if (activeTab.value !== 'discussion') {
    activeTab.value = 'discussion'
  }

  await loadDiscussion()
  focusDiscussionId.value = targetId
  if (focusResetTimer) {
    clearTimeout(focusResetTimer)
    focusResetTimer = null
  }

  await nextTick()
  const selectorId = targetId.replace(/"/g, '\\"')
  const node = document.querySelector(`[data-discussion-id="${selectorId}"]`)
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  focusResetTimer = setTimeout(() => {
    focusDiscussionId.value = ''
    focusResetTimer = null
  }, 2600)
}

const submitDiscussion = async () => {
  if (!activeLesson.value) return
  try {
    await discussionStore.add(String(route.params.id), activeLesson.value.id, discussionDraft.value, replyTarget.value?.id || null)
    discussionDraft.value = ''
    replyTarget.value = null
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Komentar gagal dikirim',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const onAssignmentFileChange = async (event) => {
  const input = event?.target
  const file = input?.files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    toastStore.push({
      type: 'error',
      title: 'File terlalu besar',
      message: 'Maksimal ukuran file 2MB.',
    })
    input.value = ''
    return
  }
  const toDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Gagal membaca file.'))
      reader.readAsDataURL(blob)
    })
  try {
    const dataUrl = await toDataUrl(file)
    assignmentDraft.value.attachmentName = file.name
    assignmentDraft.value.attachmentDataUrl = dataUrl
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Upload gagal',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  } finally {
    input.value = ''
  }
}

const clearAssignmentAttachment = () => {
  assignmentDraft.value.attachmentName = ''
  assignmentDraft.value.attachmentDataUrl = ''
  if (assignmentAttachmentInput.value) {
    assignmentAttachmentInput.value.value = ''
  }
}

const downloadSubmissionAttachment = async (submission) => {
  if (!submission) return
  if (submission.attachmentDataUrl) {
    downloadDataUrl(submission.attachmentDataUrl, submission.attachmentName || 'attachment')
    return
  }
  if (!submission.attachmentId) return
  try {
    downloadingAttachmentId.value = submission.attachmentId
    const urlPayload = await assignmentStore.getAttachmentUrl(submission.attachmentId)
    if (urlPayload.url && !urlPayload.requiresAuth) {
      window.open(urlPayload.url, '_blank', 'noopener,noreferrer')
      return
    }
    const dataUrl = await assignmentStore.getAttachmentData(submission.attachmentId)
    if (!dataUrl) {
      throw new Error('Attachment data is empty.')
    }
    downloadDataUrl(dataUrl, submission.attachmentName || 'attachment')
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal download attachment',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  } finally {
    downloadingAttachmentId.value = ''
  }
}

const submitAssignment = async () => {
  if (!activeLesson.value) return
  try {
    await assignmentStore.submit(String(route.params.id), activeLesson.value.id, assignmentDraft.value)
    toastStore.push({
      type: 'success',
      title: 'Submission tersimpan',
      message: 'Assignment berhasil dikirim.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Submission gagal',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const saveAssignmentPolicy = async () => {
  if (!activeLesson.value) return
  try {
    await assignmentStore.updateConfig(String(route.params.id), activeLesson.value.id, {
      dueAt: fromLocalDateTimeInput(assignmentPolicyDraft.value.dueAtLocal),
      graceMinutes: Number(assignmentPolicyDraft.value.graceMinutes || 0),
    })
    await coursePlayerStore.loadCourse(route.params.id)
    await refreshAssignmentOverview()
    toastStore.push({
      type: 'success',
      title: 'Deadline updated',
      message: 'Konfigurasi deadline assignment berhasil disimpan.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal update deadline',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const toggleOverviewLessonSelection = (lessonId) => {
  const current = new Set(selectedOverviewLessonIds.value)
  if (current.has(lessonId)) {
    current.delete(lessonId)
  } else {
    current.add(lessonId)
  }
  selectedOverviewLessonIds.value = Array.from(current)
}

const toggleSelectAllVisibleOverview = () => {
  const visibleIds = filteredAssignmentOverviewRows.value.map((row) => row.id)
  const selected = new Set(selectedOverviewLessonIds.value)
  if (allVisibleOverviewSelected.value) {
    visibleIds.forEach((id) => selected.delete(id))
  } else {
    visibleIds.forEach((id) => selected.add(id))
  }
  selectedOverviewLessonIds.value = Array.from(selected)
}

const saveBulkAssignmentPolicy = async () => {
  const lessonIds = selectedOverviewLessonIds.value
  if (!lessonIds.length) return
  try {
    await assignmentStore.updateConfigBulk(String(route.params.id), lessonIds, {
      dueAt: fromLocalDateTimeInput(assignmentBulkPolicyDraft.value.dueAtLocal),
      graceMinutes: Number(assignmentBulkPolicyDraft.value.graceMinutes || 0),
    })
    await coursePlayerStore.loadCourse(route.params.id)
    await refreshAssignmentOverview()
    if (activeLesson.value && lessonIds.includes(activeLesson.value.id)) {
      await loadAssignment()
    }
    toastStore.push({
      type: 'success',
      title: 'Bulk deadline updated',
      message: `Policy deadline diupdate untuk ${lessonIds.length} lesson.`,
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Bulk update gagal',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const applyBulkDuePreset = (days) => {
  const currentDraftIso = fromLocalDateTimeInput(assignmentBulkPolicyDraft.value.dueAtLocal)
  const baseIso = currentDraftIso || lessonAssignment.value?.dueAt || new Date().toISOString()
  const baseDate = new Date(baseIso)
  if (Number.isNaN(baseDate.getTime())) return
  baseDate.setDate(baseDate.getDate() + Number(days || 0))
  assignmentBulkPolicyDraft.value.dueAtLocal = toLocalDateTimeInput(baseDate.toISOString())
}

const applyBulkDueTimePreset = (timeValue) => {
  const value = String(timeValue || assignmentBulkTimePreset.value || '23:59')
  const [hourRaw, minuteRaw] = value.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return
  const currentDraftIso = fromLocalDateTimeInput(assignmentBulkPolicyDraft.value.dueAtLocal)
  const baseIso = currentDraftIso || lessonAssignment.value?.dueAt || new Date().toISOString()
  const baseDate = new Date(baseIso)
  if (Number.isNaN(baseDate.getTime())) return
  baseDate.setHours(Math.min(Math.max(hour, 0), 23), Math.min(Math.max(minute, 0), 59), 0, 0)
  assignmentBulkPolicyDraft.value.dueAtLocal = toLocalDateTimeInput(baseDate.toISOString())
}

const openLessonFromOverview = async (lessonId) => {
  const lesson = currentCourse.value?.modules?.flatMap((module) => module.lessons).find((item) => item.id === lessonId)
  if (!lesson) return
  await selectLesson(lesson)
}

const resetNoteDraft = () => {
  editingNoteId.value = ''
  noteDraftText.value = ''
  noteDraftTimestampSec.value = Math.max(0, Math.floor(Number(lessonVideoRef.value?.currentTime || 0)))
}

const startNoteEdit = (item) => {
  editingNoteId.value = item.id
  noteDraftText.value = item.note
  noteDraftTimestampSec.value = Math.max(0, Math.floor(Number(item.timestampSec || 0)))
}

const cancelNoteEdit = () => {
  resetNoteDraft()
}

const saveNoteDraft = async () => {
  if (!activeLesson.value || !canSaveNoteDraft.value) return
  try {
    if (editingNoteId.value) {
      await notesStore.update(String(route.params.id), activeLesson.value.id, editingNoteId.value, {
        note: String(noteDraftText.value || '').trim(),
      })
      toastStore.push({
        type: 'success',
        title: 'Catatan diupdate',
        message: 'Perubahan catatan berhasil disimpan.',
      })
    } else {
      await notesStore.add(String(route.params.id), activeLesson.value.id, {
        timestampSec: Math.max(0, Math.floor(Number(noteDraftTimestampSec.value || 0))),
        note: String(noteDraftText.value || '').trim(),
      })
      toastStore.push({
        type: 'success',
        title: 'Catatan ditambahkan',
        message: 'Bookmark timestamp berhasil disimpan.',
      })
    }
    resetNoteDraft()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menyimpan catatan',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const removeNote = async (noteId) => {
  if (!activeLesson.value || !noteId) return
  try {
    await notesStore.remove(String(route.params.id), activeLesson.value.id, noteId)
    if (editingNoteId.value === noteId) {
      resetNoteDraft()
    }
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menghapus catatan',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const submitAssignmentReview = async (submission) => {
  if (!activeLesson.value || !submission?.id) return
  const draft = reviewDraftById.value[submission.id]
  const rubricScores = (lessonAssignment.value?.rubric || []).map((criterion) => ({
    criterionId: criterion.id,
    score: Number(draft?.rubric?.[criterion.id] || 0),
    comment: String(draft?.rubricComment?.[criterion.id] || '').trim(),
  }))
  try {
    await assignmentStore.review(String(route.params.id), activeLesson.value.id, submission.id, {
      status: draft?.status === 'revised' ? 'revised' : 'graded',
      feedback: draft?.feedback || '',
      rubricScores,
    })
    toastStore.push({
      type: 'success',
      title: 'Review tersimpan',
      message: `Status submission diubah ke ${draft?.status === 'revised' ? 'revised' : 'graded'}.`,
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Review gagal',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const applyMention = (user) => {
  discussionDraft.value = discussionDraft.value.replace(/@([a-zA-Z0-9._-]{0,30})$/, `@${user.handle} `)
}

const toMentionHandle = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')

const setReplyTarget = (item) => {
  replyTarget.value = item
  if (!discussionDraft.value.trim()) {
    const handle = toMentionHandle(item.authorName)
    discussionDraft.value = handle ? `@${handle} ` : ''
  }
}

const clearReplyTarget = () => {
  replyTarget.value = null
}

const canManageDiscussion = (item) => {
  const role = authUser.value?.role || ''
  const userId = authUser.value?.id || ''
  return role === 'admin' || item.authorId === userId
}

const startEdit = (item) => {
  editingItemId.value = item.id
  editDraft.value = item.message
  replyTarget.value = null
}

const cancelEdit = () => {
  editingItemId.value = ''
  editDraft.value = ''
}

const saveEdit = async (item) => {
  if (!activeLesson.value) return
  try {
    await discussionStore.update(String(route.params.id), activeLesson.value.id, item.id, editDraft.value)
    cancelEdit()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal edit komentar',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const removeDiscussion = async (item) => {
  if (!activeLesson.value) return
  try {
    await discussionStore.remove(String(route.params.id), activeLesson.value.id, item.id)
    if (replyTarget.value?.id === item.id) {
      replyTarget.value = null
    }
    if (editingItemId.value === item.id) {
      cancelEdit()
    }
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal hapus komentar',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const syncLessonQuery = async (lessonId) => {
  const currentLessonQuery = String(route.query.lesson || '')
  if (!lessonId || currentLessonQuery === lessonId) return
  await router.replace({
    name: 'course-detail',
    params: { id: route.params.id },
    query: { ...route.query, lesson: lessonId },
  })
}

const applyLessonFromQuery = async () => {
  const requestedLessonId = String(route.query.lesson || '')
  if (!requestedLessonId || !currentCourse.value) return
  if (currentCourse.value.activeLesson?.id === requestedLessonId) return

  const targetLesson = currentCourse.value.modules
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.id === requestedLessonId)

  if (!targetLesson || targetLesson.isLocked) {
    await syncLessonQuery(currentCourse.value.activeLesson?.id || '')
    return
  }

  try {
    await coursePlayerStore.setActiveLesson(route.params.id, requestedLessonId)
  } catch {
    await syncLessonQuery(currentCourse.value.activeLesson?.id || '')
  }
}

const loadCourse = async () => {
  try {
    applyTabFromQuery()
    await coursePlayerStore.flushPlaybackQueue(route.params.id)
    await coursePlayerStore.loadCourse(route.params.id)
    hydratePrerequisiteEditor()
    await refreshAssignmentOverview()
    await applyLessonFromQuery()
    await syncLessonQuery(coursePlayerStore.currentCourse?.activeLesson?.id || '')
    await focusDiscussionFromQuery()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat course.'
    if (message.includes('Course tidak ditemukan.')) {
      coursePlayerStore.currentCourse = null
      await coursePlayerStore.loadCourses()
      const fallbackCourse = coursePlayerStore.courses[0]
      if (fallbackCourse?.id) {
        router.replace({
          name: 'course-detail',
          params: { id: fallbackCourse.id },
          query: fallbackCourse.activeLessonId ? { lesson: fallbackCourse.activeLessonId } : {},
        })
      } else {
        router.replace({ name: 'dashboard' })
      }
      return
    }
    toastStore.push({
      type: 'error',
      title: 'Course gagal dimuat',
      message,
    })
  }
}

const flushPlaybackQueueWithNotice = async () => {
  try {
    const result = await coursePlayerStore.flushPlaybackQueue(route.params.id)
    if (result.flushed > 0) {
      toastStore.push({
        type: 'success',
        title: 'Sync selesai',
        message: `${result.flushed} progress update berhasil disinkronkan.`,
      })
      if (activeLesson.value?.id) {
        await coursePlayerStore.loadCourse(route.params.id)
      }
    }
    if (result.dropped > 0) {
      toastStore.push({
        type: 'info',
        title: 'Sebagian sync dilewati',
        message: `${result.dropped} update progress gagal sinkron berulang dan dibuang.`,
      })
    }
  } catch {
    // no-op
  }
}

const selectLesson = async (lesson) => {
  if (lesson.isLocked) {
    toastStore.push({
      type: 'info',
      title: 'Lesson masih terkunci',
      message: lesson.lockReason || 'Selesaikan lesson sebelumnya untuk membuka lesson ini.',
    })
    return
  }
  try {
    await coursePlayerStore.setActiveLesson(route.params.id, lesson.id)
    await syncLessonQuery(coursePlayerStore.currentCourse?.activeLesson?.id || lesson.id)
    if (activeTab.value === 'discussion') {
      await loadDiscussion()
    }
    if (activeTab.value === 'assignment') {
      await loadAssignment()
    }
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal membuka lesson',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const markComplete = async () => {
  if (!activeLesson.value) return
  const completedLessonId = activeLesson.value.id
  const beforeCourse = currentCourse.value ? JSON.parse(JSON.stringify(currentCourse.value)) : null
  isCompleting.value = true
  try {
    if (activeLesson.value.type === 'video') {
      await flushPlayback(true, true)
    }
    await coursePlayerStore.completeLesson(route.params.id, activeLesson.value.id)
    await syncLessonQuery(coursePlayerStore.currentCourse?.activeLesson?.id || '')

    const module = getLessonModule(beforeCourse, completedLessonId)
    if (module) {
      const updatedModule = currentCourse.value?.modules?.find((item) => item.id === module.id)
      const moduleCompleted = updatedModule ? isModuleCompleted(updatedModule) : false
      const moduleQuiz = getModuleQuiz(module.id)

      if (moduleCompleted && moduleQuiz) {
        moduleQuizPrompt.value = {
          moduleId: module.id,
          moduleTitle: module.title,
          quiz: moduleQuiz,
        }
        toastStore.push({
          type: 'info',
          title: 'Module selesai',
          message: `${module.title} selesai. Lanjutkan ke quiz modul.`,
          actionLabel: 'Mulai Quiz',
          onAction: () => {
            router.push(toModuleQuizRoute(moduleQuiz, 'module-complete'))
          },
          timeout: 5500,
        })
      }
    }

    toastStore.push({
      type: 'success',
      title: 'Progress tersimpan',
      message: 'Lesson ditandai selesai.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menyimpan progress',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  } finally {
    isCompleting.value = false
  }
}

const goPrevious = async () => {
  if (!previousLesson.value) return
  await selectLesson(previousLesson.value)
}

const goNext = async () => {
  if (!nextLesson.value) return
  await selectLesson(nextLesson.value)
}

watch(
  () => route.params.id,
  () => {
    loadCourse()
    discussionStore.clear()
    notesStore.clear()
    assignmentStore.clear()
    discussionDraft.value = ''
    replyTarget.value = null
    reviewDraftById.value = {}
    selectedOverviewLessonIds.value = []
    resetNoteDraft()
    transcriptQuery.value = ''
    prerequisiteEditorModuleId.value = ''
    prerequisiteEditorRules.value = []
    cancelEdit()
  },
)

watch(
  () => route.query.lesson,
  () => {
    if (!currentCourse.value) return
    applyLessonFromQuery()
  },
)

watch(
  () => route.query.tab,
  () => {
    applyTabFromQuery()
  },
)

watch(
  () => route.query.focusDiscussion,
  () => {
    focusDiscussionFromQuery()
  },
)

watch(
  () => activeTab.value,
  (tab) => {
    if (tab !== 'material') {
      schedulePlaybackFlush(true)
    }
    if (tab === 'discussion') {
      loadDiscussion()
    }
    if (tab === 'material') {
      loadNotes()
      resetNoteDraft()
    }
    if (tab === 'assignment') {
      loadAssignment()
    }
  },
)

watch(
  () => activeLesson.value?.id,
  () => {
    liveVideoPositionSec.value = Math.max(0, Math.floor(Number(activeLesson.value?.playback?.positionSec || 0)))
    liveVideoDurationSec.value = Math.max(0, Math.floor(Number(activeLesson.value?.playback?.durationSec || 0)))
    videoLoadErrorTitle.value = ''
    videoLoadErrorDetail.value = ''
    lastPlaybackSavedAt = 0
    if (playbackSaveTimer) {
      clearTimeout(playbackSaveTimer)
      playbackSaveTimer = null
    }
    if (activeTab.value === 'discussion') {
      loadDiscussion()
    }
    if (activeTab.value === 'material') {
      loadNotes()
      resetNoteDraft()
      transcriptQuery.value = ''
    }
    if (activeTab.value === 'assignment') {
      loadAssignment()
    }
    replyTarget.value = null
    cancelEdit()
  },
)

watch(
  () => filteredAssignmentOverviewRows.value.map((row) => row.id).join('|'),
  () => {
    const allowed = new Set(assignmentOverviewRows.value.map((row) => row.id))
    selectedOverviewLessonIds.value = selectedOverviewLessonIds.value.filter((id) => allowed.has(id))
  },
)

watch(
  () => prerequisiteEditorModuleId.value,
  (moduleId) => {
    if (!moduleId) return
    hydratePrerequisiteEditor(moduleId)
  },
)

onMounted(() => {
  autoCompleteVideoEnabled.value = readAutoCompleteVideoPreference()
  loadCourse()
  if (activeTab.value === 'material') {
    loadNotes()
    resetNoteDraft()
  }
  window.addEventListener('online', flushPlaybackQueueWithNotice)
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onBeforeUnmount(() => {
  if (focusResetTimer) {
    clearTimeout(focusResetTimer)
    focusResetTimer = null
  }
  if (playbackSaveTimer) {
    clearTimeout(playbackSaveTimer)
    playbackSaveTimer = null
  }
  flushPlayback(false, true)
  window.removeEventListener('online', flushPlaybackQueueWithNotice)
  window.removeEventListener('keydown', handleGlobalKeyDown)
})

watch(
  () => autoCompleteVideoEnabled.value,
  (value) => {
    writeAutoCompleteVideoPreference(Boolean(value))
  },
)
</script>
