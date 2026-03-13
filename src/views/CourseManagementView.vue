<template>
  <section class="quiz-admin-layout course-mgmt-layout">
    <article class="card quiz-admin-list course-mgmt-list">
      <p class="visually-hidden" aria-live="polite">{{ a11yLiveMessage }}</p>
      <div class="section-header course-mgmt-header">
        <h2>Course Management</h2>
        <div class="table-actions course-mgmt-header-actions">
          <button v-if="canImportExportCourse" class="ghost-btn" type="button" @click="triggerImport" :disabled="isImporting">
            {{ isImporting ? 'Importing...' : 'Import JSON' }}
          </button>
          <button v-if="canImportExportCourse" class="ghost-btn" type="button" @click="exportAllJson">Export All</button>
          <button v-if="canDuplicateCourse" class="ghost-btn" type="button" @click="duplicateSelected" :disabled="!editor.id">Duplicate</button>
          <button v-if="canCreateCourse" class="primary-btn" type="button" @click="createNewCourse">New Course</button>
        </div>
      </div>
      <p class="muted">Kelola lifecycle course: draft, curriculum, workflow publish, dan schedule.</p>
      <div class="cm-prerequisite-chip-list">
        <span class="pill">Perms</span>
        <span class="pill" :class="{ 'pill-danger': !permissions.view }">view: {{ permissions.view ? 'yes' : 'no' }}</span>
        <span class="pill" :class="{ 'pill-danger': !permissions.create }">create: {{ permissions.create ? 'yes' : 'no' }}</span>
        <span class="pill" :class="{ 'pill-danger': !permissions.edit }">edit: {{ permissions.edit ? 'yes' : 'no' }}</span>
        <span class="pill" :class="{ 'pill-danger': !permissions.publish }">publish: {{ permissions.publish ? 'yes' : 'no' }}</span>
        <span class="pill" :class="{ 'pill-danger': !permissions.delete }">delete: {{ permissions.delete ? 'yes' : 'no' }}</span>
      </div>
      <input ref="importInputRef" class="hidden-input" type="file" accept="application/json,.json" @change="handleImportFile" />
      <article v-if="canImportExportCourse" class="assignment-policy-card course-import-options-card">
        <h4>Import Options</h4>
        <div class="cm-lesson-toggle-row">
          <label class="quiz-select-page"><input v-model="importOptions.dryRun" type="checkbox" /> Dry run (tanpa simpan)</label>
          <label class="quiz-select-page"><input v-model="importOptions.atomic" type="checkbox" /> Atomic (rollback jika ada error)</label>
        </div>
        <div class="table-actions">
          <button class="ghost-btn danger-btn" type="button" :disabled="isStorageCleanupRunning" @click="runStorageCleanup">
            {{ isStorageCleanupRunning ? 'Cleaning...' : 'Cleanup Storage' }}
          </button>
        </div>
      </article>

      <div class="quiz-admin-filter-row course-mgmt-filter-row">
        <input
          v-model="searchKeyword"
          class="quiz-input"
          type="search"
          aria-label="Search course"
          placeholder="Search title/id/slug/category..."
        />
        <select v-model="statusFilter" class="quiz-input" aria-label="Filter by status">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select v-model="sortKey" class="quiz-input" aria-label="Sort key">
          <option value="updatedAt">Sort: Updated</option>
          <option value="title">Sort: Title</option>
          <option value="status">Sort: Status</option>
          <option value="lessonCount">Sort: Lessons</option>
        </select>
        <select v-model="sortDir" class="quiz-input" aria-label="Sort direction">
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>

      <article v-if="importReport" class="assignment-policy-card">
        <h4>Import Report</h4>
        <p class="muted">
          {{ importReport.importedCount }} imported · {{ importReport.createdCount }} created · {{ importReport.updatedCount }} updated ·
          {{ importReport.errorCount }} error · {{ importReport.cancelled ? 'cancelled' : 'completed' }}
        </p>
        <ul class="cm-asset-history">
          <li v-for="(row, idx) in importReport.items.slice(0, 10)" :key="`import-row-${idx}`">
            {{ row.status }} · {{ row.id || row.slug || 'unknown' }} · {{ row.message }}
          </li>
        </ul>
      </article>

      <div class="course-admin-grid">
        <article v-for="course in paginatedCourses" :key="course.id" class="quiz-admin-item" :class="{ active: editor.id === course.id }">
          <label class="quiz-item-check">
            <input type="checkbox" :checked="selectedIds.includes(course.id)" :aria-label="`Select course ${course.title || course.id}`" @change="toggleSelected(course.id)" />
          </label>
          <button type="button" class="quiz-admin-select" @click="openEditor(course.id)">
            <strong>{{ course.title }}</strong>
            <span>{{ course.id }} · {{ course.slug }}</span>
            <span class="muted">
              {{ course.moduleCount }} modules · {{ course.lessonCount }} lessons · {{ course.durationTotal }}m · {{ course.assetCount }} assets ·
              {{ course.prerequisiteCount || 0 }} prereq
            </span>
          </button>
          <div class="quiz-admin-item-actions">
            <span class="status-pill" :class="statusClass(course.status)">{{ course.status }}</span>
            <button v-if="canPublishCourse" class="ghost-btn" type="button" @click="quickToggleStatus(course)">
              {{ course.status === 'published' ? 'Unpublish' : 'Publish' }}
            </button>
          </div>
          <span class="pill course-level-pill">{{ course.category }} · {{ course.level }}</span>
        </article>
      </div>

      <div v-if="selectedIds.length && canBulkCourse" class="bulk-row">
        <span>{{ selectedIds.length }} course terpilih</span>
        <div class="table-actions">
          <button v-if="canPublishCourse" class="ghost-btn" type="button" :disabled="isBulkBusy" @click="runBulkStatus('published')">Publish</button>
          <button class="ghost-btn" type="button" :disabled="isBulkBusy" @click="runBulkStatus('draft')">Draft</button>
          <button class="ghost-btn" type="button" :disabled="isBulkBusy" @click="runBulkStatus('archived')">Archive</button>
          <button class="ghost-btn" type="button" :disabled="isBulkBusy" @click="runBulkAutoPrerequisite">Auto Prereq</button>
          <button class="ghost-btn" type="button" :disabled="isBulkBusy" @click="runBulkClearPrerequisite">Clear Prereq</button>
          <button v-if="canImportExportCourse" class="ghost-btn" type="button" @click="exportSelectedJson">Export Selected</button>
          <button class="ghost-btn danger-btn" type="button" :disabled="!canDeleteCourse || isBulkBusy" @click="runBulkDelete">Delete Selected</button>
          <button v-if="canPublishCourse" class="ghost-btn" type="button" :disabled="isBulkBusy" @click="queueBulkJob('bulk-status', { ids: selectedIds, statusValue: 'published' })">
            Queue Publish
          </button>
          <button class="ghost-btn" type="button" :disabled="isBulkBusy" @click="queueBulkJob('bulk-auto-prerequisite', { ids: selectedIds })">
            Queue Auto Prereq
          </button>
          <button class="ghost-btn danger-btn" type="button" :disabled="!canDeleteCourse || isBulkBusy" @click="queueBulkJob('bulk-delete', { ids: selectedIds })">
            Queue Delete
          </button>
        </div>
      </div>

      <p v-if="!filteredCourses.length && !isLoading" class="muted">Belum ada course.</p>
      <div v-if="filteredCourses.length" class="pager-row course-mgmt-pager">
        <span>Page {{ page }} / {{ totalPages }}</span>
        <div class="table-actions">
          <label class="quiz-select-page">
            <input type="checkbox" :checked="isPageSelected" aria-label="Select all courses on current page" @change="toggleSelectPage" />
            Select page
          </label>
          <select v-model.number="pageSize">
            <option :value="5">5 / page</option>
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
          </select>
          <button class="ghost-btn" type="button" :disabled="page <= 1" @click="page--">Prev</button>
          <button class="ghost-btn" type="button" :disabled="page >= totalPages" @click="page++">Next</button>
        </div>
      </div>
      <p v-if="isLoading" class="muted">Memuat daftar course...</p>
    </article>

    <article class="card quiz-admin-editor course-mgmt-editor">
      <div class="quiz-editor-toolbar">
        <h3>{{ editor.id ? 'Edit Course' : 'Create Course' }}</h3>
        <div class="table-actions quiz-editor-actions">
          <label class="quiz-select-page">
            <input v-model="showAdvancedInputs" type="checkbox" aria-label="Advanced Mode" />
            Advanced Mode
          </label>
          <button class="ghost-btn" type="button" @click="isPreviewMode = !isPreviewMode">
            {{ isPreviewMode ? 'Back to Edit' : 'Student Preview' }}
          </button>
          <button v-if="canEditCourse" class="ghost-btn" type="button" @click="setDraft" :disabled="editor.status === 'draft'">Set Draft</button>
          <button v-if="canEditCourse" class="ghost-btn" type="button" @click="archiveEditor" :disabled="editor.status === 'archived'">Archive</button>
          <button v-if="canDeleteCourse" class="ghost-btn danger-btn" type="button" @click="removeCurrentCourse" :disabled="!editor.id">Delete</button>
          <button v-if="canEditCourse" class="primary-btn" type="button" :disabled="isSaving" @click="saveCourse">{{ isSaving ? 'Saving...' : 'Save Course' }}</button>
        </div>
      </div>
      <article class="assignment-policy-card">
        <div class="cm-observability-kpi">
          <span class="pill" :class="{ 'pill-danger': saveState.mode === 'error' }">Save: {{ saveState.label }}</span>
          <span class="pill">Manual: {{ saveState.lastManualAt ? formatDateTime(saveState.lastManualAt) : '-' }}</span>
          <span class="pill">Autosave: {{ saveState.lastAutoAt ? formatDateTime(saveState.lastAutoAt) : '-' }}</span>
          <span class="pill" :class="{ 'pill-danger': saveState.conflictCount > 0 }">Conflict: {{ saveState.conflictCount }}</span>
        </div>
        <p class="muted" v-if="saveState.message">{{ saveState.message }}</p>
        <div class="table-actions" v-if="saveState.label === 'Conflict' || saveState.label === 'Draft Reapplied'">
          <button class="ghost-btn" type="button" :disabled="!pendingConflictDraft" @click="reapplyConflictDraft">Reapply Local Draft</button>
        </div>
      </article>
      <article v-if="validationMessages.length" class="quiz-admin-validation">
        <strong>Course belum memenuhi checklist publish</strong>
        <ul>
          <li v-for="message in validationMessages" :key="message">{{ message }}</li>
        </ul>
      </article>

      <template v-if="!isPreviewMode">
        <section v-if="!showAdvancedInputs" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>Basic Wizard</h4>
            <span class="pill">Step {{ basicWizard.step }} / 3</span>
          </div>
          <article class="assignment-policy-card">
            <div class="table-actions">
              <button class="ghost-btn" type="button" :class="{ active: basicWizard.step === 1 }" @click="goToBasicStep(1)">1. Info</button>
              <button class="ghost-btn" type="button" :class="{ active: basicWizard.step === 2 }" @click="goToBasicStep(2)">2. Curriculum</button>
              <button class="ghost-btn" type="button" :class="{ active: basicWizard.step === 3 }" @click="goToBasicStep(3)">3. Review</button>
            </div>
            <ul class="cm-checklist">
              <li :class="{ pass: !basicFieldErrors.slug, fail: !!basicFieldErrors.slug }">
                <span>{{ basicFieldErrors.slug ? '•' : '✓' }}</span>
                <span>Slug terisi</span>
              </li>
              <li :class="{ pass: !basicFieldErrors.title, fail: !!basicFieldErrors.title }">
                <span>{{ basicFieldErrors.title ? '•' : '✓' }}</span>
                <span>Judul course terisi</span>
              </li>
              <li :class="{ pass: !basicFieldErrors.moduleTitle, fail: !!basicFieldErrors.moduleTitle }">
                <span>{{ basicFieldErrors.moduleTitle ? '•' : '✓' }}</span>
                <span>Judul module pertama terisi</span>
              </li>
              <li :class="{ pass: !basicFieldErrors.lessonTitle, fail: !!basicFieldErrors.lessonTitle }">
                <span>{{ basicFieldErrors.lessonTitle ? '•' : '✓' }}</span>
                <span>Judul lesson pertama terisi</span>
              </li>
            </ul>
            <p class="muted">Mode basic menampilkan input inti agar cepat mulai course tanpa konfigurasi kompleks.</p>
          </article>
        </section>

        <section v-show="showAdvancedInputs || basicWizard.step === 1" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>1. Course Info</h4>
            <span class="pill">{{ editor.status || 'draft' }}</span>
          </div>
          <form class="form-grid compact quiz-admin-form" @submit.prevent="saveCourse">
            <label class="quiz-input-group">
              <span class="quiz-input-label">Slug</span>
              <input :value="editor.slug" class="quiz-input" type="text" placeholder="ui-design-fundamentals" readonly />
              <small v-if="basicFieldErrors.slug" class="fail">{{ basicFieldErrors.slug }}</small>
            </label>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Title</span>
              <input v-model="editor.title" class="quiz-input" type="text" required />
              <small v-if="basicFieldErrors.title" class="fail">{{ basicFieldErrors.title }}</small>
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Course ID</span>
              <input v-model="editor.id" class="quiz-input" type="text" placeholder="auto from slug if empty" />
            </label>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Description</span>
              <textarea v-model="editor.description" class="quiz-input" rows="3" placeholder="Course description..."></textarea>
            </label>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Thumbnail URL</span>
              <input v-model="editor.thumbnail" class="quiz-input" type="url" placeholder="https://..." />
              <input ref="thumbnailInputRef" class="hidden-input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" @change="handleThumbnailFileChange" />
              <div class="table-actions">
                <button class="ghost-btn" type="button" @click="triggerThumbnailUpload">Upload Image</button>
                <button class="ghost-btn" type="button" :disabled="!editor.thumbnail" @click="clearThumbnail">Clear</button>
              </div>
              <img v-if="thumbnailPreviewSrc" :src="thumbnailPreviewSrc" alt="Thumbnail preview" class="cm-thumbnail-preview" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Category</span>
              <input v-model="editor.category" class="quiz-input" type="text" placeholder="Design" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Level</span>
              <select v-model="editor.level" class="quiz-input">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Language</span>
              <select v-model="editor.language" class="quiz-input">
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Visibility</span>
              <select v-model="editor.visibility" class="quiz-input">
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="invite-only">Invite Only</option>
              </select>
            </label>
          </form>
          <div v-if="!showAdvancedInputs" class="table-actions cm-basic-next-actions">
            <button class="primary-btn" type="button" :disabled="!!basicFieldErrors.slug || !!basicFieldErrors.title" @click="goToBasicStep(2)">Next: Curriculum</button>
          </div>
        </section>

        <section v-show="showAdvancedInputs || basicWizard.step === 2" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>2. Curriculum Builder</h4>
            <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="addModule">+ Add Module</button>
          </div>

          <div class="cm-module-list">
            <article
              v-for="(module, moduleIndex) in editor.modules"
              :key="`module-${moduleIndex}`"
              class="cm-module-card"
              :draggable="canEditCourse"
              @dragstart="onModuleDragStart(moduleIndex)"
              @dragover.prevent
              @drop="onModuleDrop(moduleIndex)"
              @dragend="onModuleDragEnd"
            >
              <div class="cm-module-head">
                <strong>Module {{ moduleIndex + 1 }}</strong>
                <div class="table-actions">
                  <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="duplicateModule(moduleIndex)">Duplicate</button>
                  <button class="ghost-btn" type="button" :disabled="moduleIndex === 0 || !canEditCourse" @click="moveModule(moduleIndex, -1)">↑</button>
                  <button class="ghost-btn" type="button" :disabled="moduleIndex >= editor.modules.length - 1 || !canEditCourse" @click="moveModule(moduleIndex, 1)">↓</button>
                  <button class="ghost-btn danger-btn" type="button" :disabled="editor.modules.length <= 1 || !canEditCourse" @click="removeModule(moduleIndex)">
                    Remove
                  </button>
                </div>
              </div>
              <div class="form-grid compact">
                <label>
                  <span class="quiz-input-label">Module ID</span>
                  <input v-model="module.id" class="quiz-input" type="text" />
                </label>
                <label class="full">
                  <span class="quiz-input-label">Module Title</span>
                  <input v-model="module.title" class="quiz-input" type="text" />
                  <small v-if="moduleIndex === 0 && basicFieldErrors.moduleTitle" class="fail">{{ basicFieldErrors.moduleTitle }}</small>
                </label>
                <label class="full">
                  <span class="quiz-input-label">Description</span>
                  <textarea v-model="module.description" class="quiz-input" rows="2"></textarea>
                </label>
              </div>

              <div class="cm-lesson-list">
                <article
                  v-for="(lesson, lessonIndex) in module.lessons"
                  :key="`lesson-${moduleIndex}-${lessonIndex}`"
                  class="cm-lesson-row"
                  :draggable="canEditCourse"
                  @dragstart="onLessonDragStart(moduleIndex, lessonIndex)"
                  @dragover.prevent
                  @drop="onLessonDrop(moduleIndex, lessonIndex)"
                  @dragend="onLessonDragEnd"
                >
                  <div class="cm-lesson-head">
                    <strong>Lesson {{ lessonIndex + 1 }}</strong>
                    <div class="table-actions">
                      <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="duplicateLesson(moduleIndex, lessonIndex)">Duplicate</button>
                      <button class="ghost-btn" type="button" :disabled="lessonIndex === 0 || !canEditCourse" @click="moveLesson(moduleIndex, lessonIndex, -1)">↑</button>
                      <button class="ghost-btn" type="button" :disabled="lessonIndex >= module.lessons.length - 1 || !canEditCourse" @click="moveLesson(moduleIndex, lessonIndex, 1)">↓</button>
                      <button class="ghost-btn danger-btn" type="button" :disabled="module.lessons.length <= 1 || !canEditCourse" @click="removeLesson(moduleIndex, lessonIndex)">
                        Remove
                      </button>
                    </div>
                  </div>

                  <div class="form-grid compact">
                    <label>
                      <span class="quiz-input-label">Lesson ID</span>
                      <input v-model="lesson.id" class="quiz-input" type="text" />
                    </label>
                    <label class="full">
                      <span class="quiz-input-label">Lesson Title</span>
                      <input v-model="lesson.title" class="quiz-input" type="text" />
                      <small v-if="moduleIndex === 0 && lessonIndex === 0 && basicFieldErrors.lessonTitle" class="fail">{{ basicFieldErrors.lessonTitle }}</small>
                    </label>
                    <label>
                      <span class="quiz-input-label">Type</span>
                      <select v-model="lesson.type" class="quiz-input" @change="onLessonTypeChange(lesson)">
                        <option value="video">Video</option>
                        <option value="article">Article</option>
                        <option value="quiz">Quiz</option>
                        <option value="assignment">Assignment</option>
                        <option value="live">Live Session</option>
                      </select>
                    </label>
                    <label>
                      <span class="quiz-input-label">Duration (minutes)</span>
                      <input v-model.number="lesson.durationMin" class="quiz-input" type="number" min="1" />
                      <small v-if="moduleIndex === 0 && lessonIndex === 0 && basicFieldErrors.lessonDuration" class="fail">{{ basicFieldErrors.lessonDuration }}</small>
                    </label>
                    <section class="cm-lesson-type-config full">
                      <div class="cm-lesson-type-config-head">
                        <span class="quiz-input-label">Type Configuration</span>
                        <span class="pill">{{ lesson.type }}</span>
                      </div>
                      <div class="form-grid compact">
                        <label v-if="lesson.type === 'video'" class="full">
                          <span class="quiz-input-label">Video URL</span>
                          <input v-model="lesson.videoUrl" class="quiz-input" type="url" placeholder="https://..." @input="syncLessonPrimaryUrl(lesson)" />
                        </label>
                        <label v-if="lesson.type === 'video'" class="full">
                          <span class="quiz-input-label">Transcript URL</span>
                          <input v-model="lesson.transcriptUrl" class="quiz-input" type="url" placeholder="https://..." />
                        </label>

                        <label v-if="lesson.type === 'article'" class="full">
                          <span class="quiz-input-label">Article Content</span>
                          <textarea v-model="lesson.articleContent" class="quiz-input" rows="3" placeholder="Ringkasan atau isi artikel..."></textarea>
                        </label>
                        <label v-if="lesson.type === 'article'" class="full">
                          <span class="quiz-input-label">Reference URL</span>
                          <input v-model="lesson.articleReferenceUrl" class="quiz-input" type="url" placeholder="https://..." @input="syncLessonPrimaryUrl(lesson)" />
                        </label>
                        <label v-if="lesson.type === 'article'" class="full">
                          <span class="quiz-input-label">Article File</span>
                          <input
                            :ref="(el) => setArticleFileInputRef(moduleIndex, lessonIndex, el)"
                            class="hidden-input"
                            type="file"
                            accept=".pdf,.txt,.md,.doc,.docx,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            @change="onArticleFileChange($event, lesson)"
                          />
                          <div class="table-actions">
                            <button class="ghost-btn" type="button" @click="triggerArticleUpload(moduleIndex, lessonIndex)">Upload Article</button>
                            <button class="ghost-btn" type="button" :disabled="!lesson.articleAttachmentId && !lesson.articleAttachmentUrl" @click="clearArticleAttachment(lesson, moduleIndex, lessonIndex)">
                              Remove File
                            </button>
                          </div>
                          <small v-if="lesson.articleAttachmentName" class="muted">Attached: {{ lesson.articleAttachmentName }}</small>
                        </label>

                        <label v-if="lesson.type === 'quiz'" class="full">
                          <span class="quiz-input-label">Quiz ID</span>
                          <select v-model="lesson.quizId" class="quiz-input">
                            <option value="">Pilih quiz...</option>
                            <option v-for="quiz in publishedQuizOptions" :key="`quiz-option-${quiz.id}`" :value="quiz.id">
                              {{ quiz.title || quiz.id }} ({{ quiz.id }})
                            </option>
                          </select>
                          <small v-if="!publishedQuizOptions.length" class="muted">Belum ada quiz published. Buat dulu di Manage Quiz.</small>
                          <div class="table-actions">
                            <button class="ghost-btn" type="button" @click="openQuizManagement">Manage Quiz</button>
                            <button class="ghost-btn" type="button" :disabled="!lesson.quizId" @click="openLinkedQuiz(lesson)">Open Quiz View</button>
                          </div>
                        </label>
                        <label v-if="lesson.type === 'quiz'">
                          <span class="quiz-input-label">Passing Score (%)</span>
                          <input v-model.number="lesson.quizPassingScore" class="quiz-input" type="number" min="0" max="100" />
                        </label>
                        <label v-if="lesson.type === 'quiz'">
                          <span class="quiz-input-label">Timer (minutes)</span>
                          <input v-model.number="lesson.quizTimerMin" class="quiz-input" type="number" min="0" />
                        </label>

                        <label v-if="lesson.type === 'assignment'" class="full">
                          <span class="quiz-input-label">Assignment Instruction</span>
                          <textarea v-model="lesson.assignmentInstruction" class="quiz-input" rows="3" placeholder="Instruksi tugas..."></textarea>
                        </label>
                        <label v-if="lesson.type === 'assignment'">
                          <span class="quiz-input-label">Submission Mode</span>
                          <select v-model="lesson.assignmentMode" class="quiz-input">
                            <option value="file">File</option>
                            <option value="link">Link</option>
                            <option value="text">Text</option>
                          </select>
                        </label>
                        <label v-if="lesson.type === 'assignment'">
                          <span class="quiz-input-label">Due Date</span>
                          <input v-model="lesson.assignmentDueAt" class="quiz-input" type="datetime-local" />
                        </label>
                        <label v-if="lesson.type === 'assignment'" class="full">
                          <span class="quiz-input-label">Resource URL</span>
                          <input v-model="lesson.assignmentResourceUrl" class="quiz-input" type="url" placeholder="https://..." @input="syncLessonPrimaryUrl(lesson)" />
                        </label>

                        <label v-if="lesson.type === 'live'" class="full">
                          <span class="quiz-input-label">Meeting URL</span>
                          <input v-model="lesson.liveMeetingUrl" class="quiz-input" type="url" placeholder="https://..." @input="syncLessonPrimaryUrl(lesson)" />
                        </label>
                        <label v-if="lesson.type === 'live'">
                          <span class="quiz-input-label">Session Start</span>
                          <input v-model="lesson.liveStartAt" class="quiz-input" type="datetime-local" />
                        </label>
                        <label v-if="lesson.type === 'live'">
                          <span class="quiz-input-label">Timezone</span>
                          <input v-model="lesson.liveTimezone" class="quiz-input" type="text" placeholder="Asia/Jakarta" />
                        </label>

                        <label class="full">
                          <span class="quiz-input-label">Content URL (Primary)</span>
                          <input v-model="lesson.contentUrl" class="quiz-input" type="url" placeholder="https://..." />
                        </label>
                      </div>
                    </section>
                  </div>
                  <div class="cm-lesson-toggle-row">
                    <label class="quiz-select-page"><input v-model="lesson.isPreview" type="checkbox" /> Preview lesson</label>
                    <label class="quiz-select-page"><input v-model="lesson.isLocked" type="checkbox" /> Locked by default</label>
                  </div>
                </article>
              </div>

              <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="addLesson(moduleIndex)">+ Add Lesson</button>
            </article>
          </div>
          <div v-if="!showAdvancedInputs" class="table-actions cm-basic-curriculum-actions">
            <button class="ghost-btn" type="button" @click="goToBasicStep(1)">Back: Info</button>
            <button class="primary-btn" type="button" :disabled="Object.keys(basicFieldErrors).length > 0" @click="goToBasicStep(3)">Next: Review</button>
          </div>
        </section>

        <section v-if="!showAdvancedInputs && basicWizard.step === 3" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>3. Review & Start</h4>
            <span class="pill" :class="{ 'pill-danger': Object.keys(basicFieldErrors).length > 0 }">
              {{ Object.keys(basicFieldErrors).length ? 'Perlu Perbaikan' : 'Siap Disimpan' }}
            </span>
          </div>
          <article class="assignment-policy-card">
            <ul class="cm-asset-history">
              <li><strong>Slug:</strong> {{ editor.slug || '-' }}</li>
              <li><strong>Title:</strong> {{ editor.title || '-' }}</li>
              <li><strong>Module 1:</strong> {{ editor.modules?.[0]?.title || '-' }}</li>
              <li><strong>Lesson 1:</strong> {{ editor.modules?.[0]?.lessons?.[0]?.title || '-' }} ({{ editor.modules?.[0]?.lessons?.[0]?.durationMin || 0 }}m)</li>
            </ul>
            <div class="table-actions">
              <button class="ghost-btn" type="button" @click="goToBasicStep(1)">Back to Step 1</button>
              <button class="ghost-btn" type="button" @click="goToBasicStep(2)">Back to Step 2</button>
              <button v-if="canEditCourse" class="primary-btn" type="button" :disabled="Object.keys(basicFieldErrors).length > 0 || isSaving" @click="saveCourse">
                {{ isSaving ? 'Saving...' : 'Save Course' }}
              </button>
            </div>
            <p class="muted">Setelah course tersimpan, aktifkan Advanced untuk mengatur publish workflow, access rules, dan integrasi.</p>
          </article>
        </section>

        <section v-if="showAdvancedInputs && canEditCourse" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>3. Content & Assets</h4>
            <span class="pill">{{ editor.assets?.length || 0 }} assets</span>
          </div>
          <article class="assignment-policy-card">
            <h4>Add Asset</h4>
            <div class="form-grid compact">
              <label>
                <span class="quiz-input-label">Asset Name</span>
                <input v-model="assetDraft.name" class="quiz-input" type="text" placeholder="Module Worksheet PDF" />
              </label>
              <label>
                <span class="quiz-input-label">Type</span>
                <select v-model="assetDraft.type" class="quiz-input">
                  <option value="file">File</option>
                  <option value="video">Video</option>
                  <option value="link">Link</option>
                </select>
              </label>
              <label class="full">
                <span class="quiz-input-label">URL</span>
                <input v-model="assetDraft.url" class="quiz-input" type="url" placeholder="https://..." />
              </label>
            </div>
            <div class="table-actions">
              <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="addAsset">+ Add Asset</button>
            </div>
          </article>
          <div class="cm-asset-list">
            <article v-for="asset in editor.assets || []" :key="asset.id" class="cm-asset-card">
              <div class="cm-module-head">
                <strong>{{ asset.name || asset.id }}</strong>
                <span class="pill">v{{ asset.version }}</span>
              </div>
              <p class="muted">{{ asset.type }} · {{ asset.url || 'No URL' }}</p>
              <div class="table-actions">
                <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="bumpAssetVersion(asset.id)">Bump Version</button>
                <button class="ghost-btn danger-btn" type="button" :disabled="!canEditCourse" @click="removeAsset(asset.id)">Remove</button>
              </div>
              <ul v-if="asset.versions?.length" class="cm-asset-history">
                <li v-for="item in asset.versions.slice(0, 3)" :key="`${asset.id}-${item.version}-${item.updatedAt}`">
                  v{{ item.version }} · {{ item.note }} · {{ formatDateTime(item.updatedAt) }}
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section v-if="showAdvancedInputs && canEditCourse" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>4. Course Settings</h4>
          </div>
          <article class="assignment-policy-card">
            <div class="form-grid compact">
              <label>
                <span class="quiz-input-label">Completion Mode</span>
                <select v-model="editor.settings.completionMode" class="quiz-input">
                  <option value="lesson">Per Lesson</option>
                  <option value="module">Per Module</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <label>
                <span class="quiz-input-label">Completion Threshold (%)</span>
                <input v-model.number="editor.settings.completionThresholdPercent" class="quiz-input" type="number" min="1" max="100" />
              </label>
              <label>
                <span class="quiz-input-label">Certificate Template</span>
                <select v-model="editor.settings.certificateTemplate" class="quiz-input">
                  <option value="default">Default</option>
                  <option value="modern">Modern</option>
                  <option value="corporate">Corporate</option>
                </select>
              </label>
              <label>
                <span class="quiz-input-label">Max Retake</span>
                <input v-model.number="editor.settings.maxRetake" class="quiz-input" type="number" min="0" />
              </label>
              <label>
                <span class="quiz-input-label">Enrollment Cap</span>
                <input v-model.number="editor.settings.enrollmentCap" class="quiz-input" type="number" min="0" />
              </label>
              <label>
                <span class="quiz-input-label">Estimated Hours</span>
                <input v-model.number="editor.settings.estimatedHours" class="quiz-input" type="number" min="0" />
              </label>
              <label>
                <span class="quiz-input-label">Prerequisite Mode</span>
                <select v-model="editor.settings.prerequisiteMode" class="quiz-input">
                  <option value="all">All prerequisites must pass</option>
                  <option value="any">Any prerequisite is enough</option>
                </select>
              </label>
            </div>
            <div class="cm-lesson-toggle-row">
              <label class="quiz-select-page"><input v-model="editor.settings.certificateEnabled" type="checkbox" /> Certificate enabled</label>
              <label class="quiz-select-page"><input v-model="editor.settings.allowRetake" type="checkbox" /> Allow retake</label>
              <label class="quiz-select-page"><input v-model="editor.settings.allowProgressReset" type="checkbox" /> Allow progress reset</label>
            </div>
          </article>
          <article class="assignment-policy-card">
            <h4>Prerequisite & Access Rules</h4>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Prerequisite Course IDs (comma separated)</span>
              <textarea
                v-model="prerequisiteCsv"
                class="quiz-input"
                rows="2"
                placeholder="course-ui-101, course-ui-201"
              ></textarea>
            </label>
            <p class="muted">Tips: pilih cepat dari daftar course di bawah, lalu simpan.</p>
            <div class="table-actions">
              <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="autoSuggestEditorPrerequisite">Auto Suggest Path</button>
            </div>
            <div class="cm-prerequisite-chip-list">
              <button
                v-for="option in prerequisiteCourseOptions"
                :key="option.id"
                class="ghost-btn cm-prerequisite-chip"
                :class="{ active: option.selected }"
                type="button"
                :disabled="!canEditCourse"
                @click="togglePrerequisiteCourse(option.id)"
              >
                {{ option.title || option.id }}
              </button>
            </div>
            <div class="cm-dependency-graph-wrap">
              <svg class="cm-dependency-graph" :viewBox="`0 0 1000 ${dependencyGraph.height}`" preserveAspectRatio="xMidYMid meet">
                <line
                  v-for="edge in dependencyGraph.edges"
                  :key="edge.key"
                  :x1="edge.x1"
                  :y1="edge.y1"
                  :x2="edge.x2"
                  :y2="edge.y2"
                  :class="['cm-dependency-edge', edge.kind, { dim: edge.dim }]"
                />
                <g v-for="node in dependencyGraph.nodes" :key="node.key" :transform="`translate(${node.x}, ${node.y})`">
                  <rect
                    x="-120"
                    y="-20"
                    width="240"
                    height="40"
                    rx="12"
                    :class="['cm-dependency-node', node.kind, { cycle: node.cycle, invalid: node.invalid, selected: node.selected, focused: node.focused, matched: node.matched, dim: node.dim, 'not-clickable': !node.clickable }]"
                    role="button"
                    :tabindex="node.clickable ? 0 : -1"
                    :aria-label="`Dependency node ${node.label}`"
                    @click="onDependencyNodeClick(node, $event)"
                    @keydown.enter.prevent="onDependencyNodeClick(node)"
                    @keydown.space.prevent="onDependencyNodeClick(node)"
                  >
                    <title>{{ node.label }}</title>
                    <desc>Dependency graph node for {{ node.label }}</desc>
                  </rect>
                  <text x="0" y="5" text-anchor="middle" class="cm-dependency-node-label">{{ node.label }}</text>
                </g>
              </svg>
            </div>
            <div class="cm-dependency-legend">
              <div class="cm-dependency-view-switch">
                <button
                  v-for="mode in dependencyViewModes"
                  :key="mode.value"
                  class="ghost-btn"
                  type="button"
                  :class="{ active: dependencyViewMode === mode.value }"
                  @click="setDependencyViewMode(mode.value)"
                >
                  {{ mode.label }}
                </button>
              </div>
              <span><i class="swatch upstream"></i>Upstream</span>
              <span><i class="swatch center"></i>Current</span>
              <span><i class="swatch downstream"></i>Downstream</span>
              <span><i class="swatch selected"></i>Selected prerequisite</span>
              <button v-if="focusedDependencyNodeId" class="ghost-btn" type="button" @click="clearDependencyFocus">Clear Focus</button>
            </div>
            <div class="cm-dependency-search">
              <input
                v-model="dependencyNodeQuery"
                class="quiz-input"
                type="search"
                aria-label="Search dependency graph node"
                placeholder="Search node title/id..."
                @keydown.enter.prevent="focusFirstDependencySearchResult"
              />
              <div v-if="dependencyNodeQuery.trim()" class="cm-dependency-search-result">
                <button
                  v-for="item in dependencySearchResults"
                  :key="`dep-search-${item.id}`"
                  class="ghost-btn cm-dependency-search-item"
                  type="button"
                  @click="focusDependencyNode(item.id)"
                >
                  <span>{{ item.title }}</span>
                  <small>{{ item.id }}</small>
                </button>
                <p v-if="!dependencySearchResults.length" class="muted">Tidak ada node yang cocok.</p>
              </div>
            </div>
            <article v-if="focusedDependencyNode" class="cm-dependency-focus-panel">
              <div class="cm-dependency-focus-head">
                <strong>{{ focusedDependencyNode.title }}</strong>
                <span class="pill">{{ focusedDependencyNode.relationLabel }}</span>
              </div>
              <p class="muted">ID: {{ focusedDependencyNode.id }}</p>
              <p class="muted">
                Status: {{ focusedDependencyNode.status }} · Level: {{ focusedDependencyNode.level }} ·
                {{ focusedDependencyNode.moduleCount }} module · {{ focusedDependencyNode.lessonCount }} lesson
              </p>
              <div class="table-actions">
                <button
                  class="ghost-btn"
                  type="button"
                  :disabled="!focusedDependencyNode.exists || focusedDependencyNode.isCurrent"
                  @click="openFocusedDependencyCourse"
                >
                  Open Course
                </button>
                <button
                  class="ghost-btn"
                  type="button"
                  :disabled="!canEditCourse || focusedDependencyNode.isCurrent"
                  @click="toggleFocusedDependencyPrerequisite"
                >
                  {{ focusedDependencyNode.selected ? 'Remove Prereq' : 'Set as Prereq' }}
                </button>
              </div>
            </article>
            <ul class="cm-dependency-info">
              <li><strong>View:</strong> {{ dependencyViewModes.find((item) => item.value === dependencyViewMode)?.label }}</li>
              <li v-if="focusedDependencyNodeId"><strong>Focus:</strong> {{ dependencyFocusLabel }}</li>
              <li class="muted">Klik node = focus path. Ctrl/Cmd + klik = toggle prerequisite.</li>
              <li><strong>Upstream:</strong> {{ dependencyInsight.upstream.length }} course</li>
              <li><strong>Downstream:</strong> {{ dependencyInsight.downstream.length }} course</li>
              <li v-if="dependencyInsight.selfReference" class="fail">Course ini tidak boleh jadi prerequisite untuk dirinya sendiri.</li>
              <li v-if="dependencyInsight.invalidRefs.length" class="fail">
                Invalid prerequisite: {{ dependencyInsight.invalidRefs.join(', ') }}
              </li>
              <li v-if="dependencyInsight.cyclePath.length" class="fail">
                Cycle terdeteksi: {{ dependencyCycleText }}
              </li>
              <li v-if="!dependencyInsight.selfReference && !dependencyInsight.invalidRefs.length && !dependencyInsight.cyclePath.length" class="pass">
                Dependency graph valid.
              </li>
            </ul>
          </article>
          <article class="assignment-policy-card">
            <h4>Approval Workflow</h4>
            <div class="form-grid compact">
              <label>
                <span class="quiz-input-label">Approval Status</span>
                <select v-model="editor.settings.approvalStatus" class="quiz-input">
                  <option value="draft">Draft</option>
                  <option value="in_review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label>
                <span class="quiz-input-label">Approver IDs (comma)</span>
                <input v-model="approverCsv" class="quiz-input" type="text" placeholder="u-002, u-010" />
              </label>
            </div>
            <div class="cm-lesson-toggle-row">
              <label class="quiz-select-page"><input v-model="editor.settings.approvalRequired" type="checkbox" /> Require approval before publish</label>
            </div>
          </article>
          <article class="assignment-policy-card">
            <h4>Enrollment & Pricing</h4>
            <div class="form-grid compact">
              <label>
                <span class="quiz-input-label">Enrollment Start</span>
                <input v-model="editor.settings.enrollmentStartAt" class="quiz-input" type="datetime-local" />
              </label>
              <label>
                <span class="quiz-input-label">Enrollment End</span>
                <input v-model="editor.settings.enrollmentEndAt" class="quiz-input" type="datetime-local" />
              </label>
              <label>
                <span class="quiz-input-label">Price (USD)</span>
                <input v-model.number="editor.settings.priceUsd" class="quiz-input" type="number" min="0" step="1" />
              </label>
              <label>
                <span class="quiz-input-label">Cohort Label</span>
                <input v-model="editor.settings.cohortLabel" class="quiz-input" type="text" placeholder="Batch Q2-2026" />
              </label>
            </div>
            <div class="cm-lesson-toggle-row">
              <label class="quiz-select-page"><input v-model="editor.settings.waitlistEnabled" type="checkbox" /> Enable waitlist</label>
            </div>
          </article>
          <article class="assignment-policy-card">
            <h4>Taxonomy, Access Scope & Localization</h4>
            <div class="form-grid compact">
              <label>
                <span class="quiz-input-label">Tags (comma)</span>
                <input v-model="tagsCsv" class="quiz-input" type="text" placeholder="design-system, accessibility" />
              </label>
              <label>
                <span class="quiz-input-label">Owner IDs (comma)</span>
                <input v-model="ownerCsv" class="quiz-input" type="text" placeholder="u-001, u-002" />
              </label>
              <label>
                <span class="quiz-input-label">Editor IDs (comma)</span>
                <input v-model="editorCsv" class="quiz-input" type="text" placeholder="u-003, u-004" />
              </label>
              <label>
                <span class="quiz-input-label">Release Version</span>
                <input v-model="editor.settings.releaseVersion" class="quiz-input" type="text" placeholder="v1.0.0" />
              </label>
              <label>
                <span class="quiz-input-label">Release Channel</span>
                <select v-model="editor.settings.releaseChannel" class="quiz-input">
                  <option value="stable">Stable</option>
                  <option value="beta">Beta</option>
                  <option value="internal">Internal</option>
                </select>
              </label>
              <label>
                <span class="quiz-input-label">Locales (comma)</span>
                <input v-model="localeCsv" class="quiz-input" type="text" placeholder="id, en" />
              </label>
              <label>
                <span class="quiz-input-label">Fallback Locale</span>
                <input v-model="editor.settings.localeFallback" class="quiz-input" type="text" placeholder="id" />
              </label>
              <label>
                <span class="quiz-input-label">Retention (days)</span>
                <input v-model.number="editor.settings.complianceRetentionDays" class="quiz-input" type="number" min="30" />
              </label>
            </div>
            <article class="cm-localization-card">
              <h5>Localized Copy</h5>
              <div class="form-grid compact">
                <label>
                  <span class="quiz-input-label">Locale</span>
                  <select v-model="activeLocale" class="quiz-input">
                    <option v-for="locale in localeOptions" :key="`locale-${locale}`" :value="locale">{{ locale }}</option>
                  </select>
                </label>
                <label class="full">
                  <span class="quiz-input-label">Localized Title</span>
                  <input v-model="localizedDraft.title" class="quiz-input" type="text" />
                </label>
                <label class="full">
                  <span class="quiz-input-label">Localized Description</span>
                  <textarea v-model="localizedDraft.description" class="quiz-input" rows="2"></textarea>
                </label>
              </div>
              <div class="table-actions">
                <button class="ghost-btn" type="button" @click="applyLocalizedDraft">Apply Locale Copy</button>
              </div>
            </article>
          </article>
          <article class="assignment-policy-card">
            <h4>Content Integrity Automation</h4>
            <div class="table-actions">
              <button class="ghost-btn" type="button" @click="runContentIntegrityScan">Run Integrity Scan</button>
            </div>
            <ul class="cm-asset-history">
              <li><strong>Broken links:</strong> {{ contentIntegrityReport.brokenLinks.length || 0 }}</li>
              <li><strong>Duplicate lesson IDs:</strong> {{ contentIntegrityReport.duplicateLessonIds.length || 0 }}</li>
              <li><strong>Orphan modules:</strong> {{ contentIntegrityReport.orphanModules.length || 0 }}</li>
              <li><strong>Coverage issues:</strong> {{ contentIntegrityReport.coverageIssues.length || 0 }}</li>
            </ul>
            <p class="muted" v-if="contentIntegrityReport.lastRunAt">Last run: {{ formatDateTime(contentIntegrityReport.lastRunAt) }}</p>
          </article>
        </section>

        <section v-if="showAdvancedInputs && (canEditCourse || canPublishCourse || canScheduleCourse)" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>5. Publishing Workflow</h4>
            <span class="pill" :class="{ 'pill-danger': !canPublish }">{{ canPublish ? 'Ready to Publish' : 'Need Fixes' }}</span>
          </div>

          <article class="assignment-policy-card">
            <h4>Publish Checklist</h4>
            <ul class="cm-checklist">
              <li v-for="item in checklist" :key="item.id" :class="{ pass: item.passed, fail: !item.passed }">
                <span>{{ item.passed ? '✓' : '•' }}</span>
                <span>{{ item.label }}</span>
              </li>
            </ul>
          </article>

          <article class="assignment-policy-card">
            <h4>Publish Controls</h4>
            <div class="table-actions">
              <button class="primary-btn" type="button" :disabled="!canPublish || !canPublishCourse" @click="publishNow">Publish Now</button>
              <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="setDraft">Set Draft</button>
              <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="archiveEditor">Archive</button>
            </div>
            <p class="muted">Status saat ini: <strong>{{ editor.status }}</strong></p>
          </article>

          <article class="assignment-policy-card">
            <h4>Schedule Publish</h4>
            <div class="assignment-policy-grid">
              <label class="quiz-input-group">
                <span class="quiz-input-label">Publish At</span>
                <input v-model="scheduleForm.publishAt" class="quiz-input" type="datetime-local" />
              </label>
              <label class="quiz-input-group">
                <span class="quiz-input-label">Unpublish At</span>
                <input v-model="scheduleForm.unpublishAt" class="quiz-input" type="datetime-local" />
              </label>
            </div>
            <div class="table-actions">
              <button class="ghost-btn" type="button" :disabled="!canScheduleCourse" @click="saveSchedule">Save Schedule</button>
              <button class="ghost-btn" type="button" :disabled="!canScheduleCourse" @click="clearSchedule">Clear Schedule</button>
            </div>
            <p class="muted">Jadwal publish akan otomatis mengubah status sesuai waktu yang diset.</p>
          </article>
        </section>

        <section v-if="showAdvancedInputs && canViewHistory" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>6. Operational Audit</h4>
            <div class="table-actions">
              <button class="ghost-btn" type="button" @click="exportAuditJson">Export JSON</button>
              <button class="ghost-btn" type="button" @click="exportAuditCsv">Export CSV</button>
            </div>
          </div>
          <article class="assignment-policy-card">
            <ul class="cm-asset-history">
              <li v-for="log in recentAuditLogs" :key="log.id">
                {{ formatDateTime(log.createdAt) }} · <strong>{{ log.action }}</strong> · {{ log.courseTitle }} · {{ log.detail }}
              </li>
              <li v-if="!recentAuditLogs.length">Belum ada audit log.</li>
            </ul>
          </article>
        </section>

        <section v-if="showAdvancedInputs && canBulkCourse" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>6B. Bulk Job Queue</h4>
          </div>
          <article class="assignment-policy-card">
            <div class="table-actions">
              <label class="quiz-select-page"><input v-model="bulkQueueAutoRun" type="checkbox" /> Auto run queue worker</label>
              <button class="ghost-btn" type="button" :disabled="bulkQueueWorkerBusy" @click="processBulkQueueNow">
                {{ bulkQueueWorkerBusy ? 'Processing...' : 'Run Queue Now' }}
              </button>
              <button class="ghost-btn" type="button" :disabled="!bulkQueue.length" @click="clearCompletedQueueJobs">Clear Completed</button>
            </div>
            <p class="muted">
              Worker lease:
              <strong>{{ queueWorkerLease?.ownerId || 'idle' }}</strong>
              · expires {{ queueWorkerLease?.expiresAt ? formatDateTime(queueWorkerLease.expiresAt) : '-' }}
            </p>
            <ul class="cm-asset-history">
              <li v-for="job in bulkQueue.slice(0, 12)" :key="`queue-${job.id}`">
                {{ formatDateTime(job.createdAt) }} · <strong>{{ job.type }}</strong> · {{ job.status }} · attempts {{ job.attempts }} ·
                {{ job.processed || 0 }}/{{ job.total || 0 }}
                <button v-if="job.status !== 'completed'" class="ghost-btn" type="button" @click="runSingleQueuedJob(job.id)">Run</button>
                <button v-if="job.status !== 'running'" class="ghost-btn danger-btn" type="button" @click="removeQueuedJob(job.id)">Remove</button>
              </li>
              <li v-if="!bulkQueue.length">Queue kosong.</li>
            </ul>
          </article>
          <article class="assignment-policy-card">
            <ul class="cm-asset-history">
              <li v-for="job in bulkJobHistory.slice(0, 10)" :key="job.id">
                {{ formatDateTime(job.createdAt) }} · <strong>{{ job.type }}</strong> · {{ job.status }} · {{ job.processed }}/{{ job.total }}
                <button v-if="job.status === 'cancelled' || job.status === 'partial'" class="ghost-btn" type="button" @click="retryBulkJob(job.id)">Retry</button>
              </li>
              <li v-if="!bulkJobHistory.length">Belum ada bulk job history.</li>
            </ul>
          </article>
          <article class="assignment-policy-card">
            <h4>Dead-Letter Queue (DLQ)</h4>
            <ul class="cm-asset-history">
              <li v-for="item in bulkQueueDlq.slice(0, 10)" :key="item.id">
                {{ formatDateTime(item.createdAt) }} · <strong>{{ item.snapshot?.type || '-' }}</strong> · {{ item.reason }} · {{ item.status }}
                <button v-if="item.status === 'open'" class="ghost-btn" type="button" @click="redriveDlqItem(item.id)">Redrive</button>
              </li>
              <li v-if="!bulkQueueDlq.length">DLQ kosong.</li>
            </ul>
          </article>
        </section>

        <section v-if="showAdvancedInputs && canViewHistory" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>7. Revision History</h4>
            <button class="ghost-btn" type="button" :disabled="!canViewHistory || !editor.id" @click="refreshRevisions">
              {{ revisionsLoading ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>
          <article class="assignment-policy-card">
            <ul class="cm-asset-history">
              <li v-for="revision in revisions.slice(0, 12)" :key="revision.id">
                {{ formatDateTime(revision.createdAt) }} · v{{ revision.version }} · {{ revision.action }} · {{ revision.actor }}
                <button
                  class="ghost-btn"
                  type="button"
                  :disabled="!canRestoreRevision"
                  @click="restoreRevisionItem(revision.id)"
                >
                  Restore
                </button>
              </li>
              <li v-if="!revisions.length">Belum ada revision.</li>
            </ul>
          </article>
        </section>

        <section v-if="showAdvancedInputs && isAdminRole" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>8. Observability Dashboard</h4>
            <div class="table-actions">
              <button class="ghost-btn" type="button" :disabled="telemetryLoading || !isAdminRole" @click="refreshTelemetry">
                {{ telemetryLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
          </div>
          <article class="assignment-policy-card">
            <div class="cm-observability-controls">
              <label class="quiz-input-group">
                <span class="quiz-input-label">Severity</span>
                <select v-model="telemetrySeverityFilter" class="quiz-input" :disabled="!isAdminRole">
                  <option value="all">All</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </label>
              <label class="quiz-input-group">
                <span class="quiz-input-label">Search</span>
                <input v-model="telemetryQuery" class="quiz-input" type="search" placeholder="action/message/course..." :disabled="!isAdminRole" />
              </label>
              <label class="quiz-input-group">
                <span class="quiz-input-label">Limit</span>
                <select v-model.number="telemetryLimit" class="quiz-input" :disabled="telemetryLoading || !isAdminRole">
                  <option :value="50">50</option>
                  <option :value="120">120</option>
                  <option :value="200">200</option>
                </select>
              </label>
              <label class="quiz-select-page"><input v-model="telemetryAutoRefresh" type="checkbox" :disabled="!isAdminRole" /> Auto refresh 15s</label>
            </div>
            <div class="cm-observability-kpi">
              <span class="pill">Total: {{ telemetrySummary.total }}</span>
              <span class="pill cm-sev-info">Info: {{ telemetrySummary.info }}</span>
              <span class="pill cm-sev-warning">Warning: {{ telemetrySummary.warning }}</span>
              <span class="pill cm-sev-error">Error: {{ telemetrySummary.error }}</span>
              <span class="pill">Latest: {{ telemetrySummary.latestAt ? formatDateTime(telemetrySummary.latestAt) : '-' }}</span>
            </div>
            <div v-if="isAdminRole" class="cm-observability-event-list">
              <article v-for="event in filteredTelemetryEvents.slice(0, 24)" :key="event.id" class="cm-observability-event">
                <div class="cm-observability-event-head">
                  <strong>{{ event.action }}</strong>
                  <span class="pill" :class="`cm-sev-${event.severity || 'info'}`">{{ event.severity || 'info' }}</span>
                </div>
                <p class="muted">{{ event.message || '-' }}</p>
                <p class="muted">
                  {{ formatDateTime(event.createdAt) }} · {{ event.context?.courseId || '-' }} · {{ event.context?.operation || '-' }} ·
                  {{ event.actorEmail || event.actorId || '-' }}
                </p>
              </article>
              <p v-if="!filteredTelemetryEvents.length" class="muted">Belum ada event sesuai filter.</p>
            </div>
            <p v-else class="muted">Observability dashboard tersedia untuk admin.</p>
          </article>
        </section>

        <section v-if="showAdvancedInputs && canViewHistory" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>9. Revision Diff Viewer</h4>
          </div>
          <article class="assignment-policy-card">
            <div class="cm-revision-diff-controls">
              <label class="quiz-input-group">
                <span class="quiz-input-label">Base Revision</span>
                <select v-model="revisionDiffBaseId" class="quiz-input">
                  <option v-for="item in revisionDiffOptions" :key="`base-${item.id}`" :value="item.id">{{ item.label }}</option>
                </select>
              </label>
              <label class="quiz-input-group">
                <span class="quiz-input-label">Target Revision</span>
                <select v-model="revisionDiffTargetId" class="quiz-input">
                  <option v-for="item in revisionDiffOptions" :key="`target-${item.id}`" :value="item.id">{{ item.label }}</option>
                </select>
              </label>
            </div>
            <div class="cm-diff-kpi">
              <span class="pill">Field changed: {{ revisionDiffSummary.changedFields }}</span>
              <span class="pill">Module Δ: {{ revisionDiffSummary.moduleDelta }}</span>
              <span class="pill">Lesson Δ: {{ revisionDiffSummary.lessonDelta }}</span>
              <span class="pill">Asset Δ: {{ revisionDiffSummary.assetDelta }}</span>
              <span class="pill">Prereq Δ: {{ revisionDiffSummary.prerequisiteDelta }}</span>
            </div>
            <ul class="cm-asset-history">
              <li v-for="row in revisionDiffRows.slice(0, 20)" :key="row.key">
                <strong>{{ row.label }}:</strong> {{ row.before }} → {{ row.after }}
              </li>
              <li v-if="!revisionDiffRows.length">Tidak ada perubahan pada field utama.</li>
            </ul>
            <div class="cm-diff-structure-grid">
              <article class="cm-diff-structure-card">
                <h5>Modules</h5>
                <p class="muted">+ {{ revisionStructureDiff.modules.added.length }} · - {{ revisionStructureDiff.modules.removed.length }}</p>
                <p class="muted"><strong>Added:</strong> {{ revisionStructureDiff.modules.added.slice(0, 6).join(', ') || '-' }}</p>
                <p class="muted"><strong>Removed:</strong> {{ revisionStructureDiff.modules.removed.slice(0, 6).join(', ') || '-' }}</p>
              </article>
              <article class="cm-diff-structure-card">
                <h5>Lessons</h5>
                <p class="muted">+ {{ revisionStructureDiff.lessons.added.length }} · - {{ revisionStructureDiff.lessons.removed.length }}</p>
                <p class="muted"><strong>Added:</strong> {{ revisionStructureDiff.lessons.added.slice(0, 6).join(', ') || '-' }}</p>
                <p class="muted"><strong>Removed:</strong> {{ revisionStructureDiff.lessons.removed.slice(0, 6).join(', ') || '-' }}</p>
              </article>
              <article class="cm-diff-structure-card">
                <h5>Assets</h5>
                <p class="muted">+ {{ revisionStructureDiff.assets.added.length }} · - {{ revisionStructureDiff.assets.removed.length }}</p>
                <p class="muted"><strong>Added:</strong> {{ revisionStructureDiff.assets.added.slice(0, 6).join(', ') || '-' }}</p>
                <p class="muted"><strong>Removed:</strong> {{ revisionStructureDiff.assets.removed.slice(0, 6).join(', ') || '-' }}</p>
              </article>
              <article class="cm-diff-structure-card">
                <h5>Prerequisites</h5>
                <p class="muted">+ {{ revisionStructureDiff.prerequisites.added.length }} · - {{ revisionStructureDiff.prerequisites.removed.length }}</p>
                <p class="muted"><strong>Added:</strong> {{ revisionStructureDiff.prerequisites.added.slice(0, 6).join(', ') || '-' }}</p>
                <p class="muted"><strong>Removed:</strong> {{ revisionStructureDiff.prerequisites.removed.slice(0, 6).join(', ') || '-' }}</p>
              </article>
            </div>
            <div class="cm-revision-raw-grid">
              <article class="cm-revision-raw-card">
                <h5>Base JSON</h5>
                <pre>{{ revisionDiffBasePreview }}</pre>
              </article>
              <article class="cm-revision-raw-card">
                <h5>Target JSON</h5>
                <pre>{{ revisionDiffTargetPreview }}</pre>
              </article>
            </div>
          </article>
        </section>

        <section v-if="showAdvancedInputs && isAdminRole" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>9B. Compliance & Integrations</h4>
            <div class="table-actions">
              <button class="ghost-btn" type="button" :disabled="immutableAuditLoading || !isAdminRole" @click="refreshImmutableAudit">
                {{ immutableAuditLoading ? 'Checking...' : 'Refresh Immutable Audit' }}
              </button>
            </div>
          </div>
          <article class="assignment-policy-card">
            <h4>Immutable Audit Chain</h4>
            <div class="cm-observability-kpi">
              <span class="pill" :class="immutableAuditVerify.ok ? '' : 'pill-danger'">Integrity: {{ immutableAuditVerify.ok ? 'OK' : 'BROKEN' }}</span>
              <span class="pill">Total: {{ immutableAuditVerify.total || immutableAuditEvents.length }}</span>
              <span class="pill">Broken At: {{ immutableAuditVerify.brokenAt }}</span>
              <span class="pill">Last Hash: {{ immutableAuditVerify.lastHash ? immutableAuditVerify.lastHash.slice(0, 12) : '-' }}</span>
            </div>
            <ul class="cm-asset-history">
              <li v-for="entry in immutableAuditEvents.slice(0, 8)" :key="entry.id">
                {{ entry.timestamp }} · {{ entry.action }} · {{ entry.hash?.slice(0, 16) }}…
              </li>
            </ul>
          </article>
          <article class="assignment-policy-card">
            <h4>Webhook & Email Delivery</h4>
            <div class="form-grid compact">
              <label>
                <span class="quiz-input-label">Webhook URL</span>
                <input v-model="notificationChannels.webhookUrl" class="quiz-input" type="url" placeholder="https://..." />
              </label>
              <label>
                <span class="quiz-input-label">Email From</span>
                <input v-model="notificationChannels.emailFrom" class="quiz-input" type="email" placeholder="no-reply@curiosity.app" />
              </label>
            </div>
            <div class="cm-lesson-toggle-row">
              <label class="quiz-select-page"><input v-model="notificationChannels.webhookEnabled" type="checkbox" /> Enable webhook delivery</label>
              <label class="quiz-select-page"><input v-model="notificationChannels.emailEnabled" type="checkbox" /> Enable email delivery</label>
            </div>
            <div class="table-actions">
              <button class="ghost-btn" type="button" :disabled="!isAdminRole" @click="saveNotificationChannels">Save Channels</button>
              <button class="ghost-btn" type="button" :disabled="!isAdminRole" @click="sendNotificationTest('webhook')">Test Webhook</button>
              <button class="ghost-btn" type="button" :disabled="!isAdminRole" @click="sendNotificationTest('email')">Test Email</button>
              <button class="ghost-btn" type="button" :disabled="!editor.id || complianceExportBusy" @click="exportComplianceBundle">
                {{ complianceExportBusy ? 'Exporting...' : 'Export Compliance Bundle' }}
              </button>
            </div>
            <ul class="cm-asset-history">
              <li v-for="item in notificationDeliveryLogs.slice(0, 8)" :key="item.id">
                {{ formatDateTime(item.createdAt) }} · {{ item.channel }} · {{ item.status }} · {{ item.target || '-' }}
              </li>
              <li v-if="!notificationDeliveryLogs.length">Belum ada delivery log.</li>
            </ul>
          </article>
        </section>

        <section v-if="showAdvancedInputs && canViewHistory" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>10. Author Analytics</h4>
          </div>
          <article class="assignment-policy-card">
            <div class="cm-observability-kpi">
              <span class="pill">Draft Count: {{ authorAnalytics.draftCount }}</span>
              <span class="pill">Published Count: {{ authorAnalytics.publishedCount }}</span>
              <span class="pill">Avg Draft Age: {{ authorAnalytics.avgDraftAgeDays }} hari</span>
              <span class="pill">Checklist Failure Rate: {{ authorAnalytics.checklistFailureRate }}%</span>
              <span class="pill">Orphan Content Ratio: {{ authorAnalytics.orphanContentRatio }}%</span>
            </div>
            <p class="muted">Gunakan metrik ini untuk prioritas cleanup konten sebelum publish.</p>
          </article>
        </section>
      </template>

      <template v-else>
        <section class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>Student Preview</h4>
            <span class="pill">{{ editor.status }}</span>
          </div>

          <article class="course-preview-card">
            <div class="course-preview-head">
              <div>
                <p class="eyebrow">{{ editor.category || 'Course' }} · {{ editor.level || 'beginner' }}</p>
                <h3>{{ editor.title || 'Untitled Course' }}</h3>
                <p class="muted">{{ editor.description || 'Deskripsi belum diisi.' }}</p>
              </div>
              <span class="status-pill" :class="statusClass(editor.status)">{{ editor.status }}</span>
            </div>
            <p class="course-mini-meta">
              {{ editor.modules.length }} modules · {{ totalLessons }} lessons · {{ totalDuration }} minutes · {{ editor.language.toUpperCase() }}
            </p>
            <div class="cm-preview-module-list">
              <article v-for="(module, moduleIndex) in editor.modules" :key="`preview-${moduleIndex}`" class="cm-preview-module">
                <strong>{{ module.title || `Module ${moduleIndex + 1}` }}</strong>
                <ul>
                  <li v-for="(lesson, lessonIndex) in module.lessons" :key="`preview-lesson-${moduleIndex}-${lessonIndex}`">
                    <span>{{ lesson.title || `Lesson ${lessonIndex + 1}` }}</span>
                    <small>
                      {{ lesson.type }} · {{ lesson.durationMin }}m
                      <em v-if="lesson.isPreview"> · preview</em>
                      <em v-if="lesson.isLocked"> · locked</em>
                    </small>
                  </li>
                </ul>
              </article>
            </div>
          </article>
        </section>
      </template>
    </article>

    <div v-if="operationState.active" class="modal-overlay" @click.self>
      <article class="modal-card cm-progress-modal" role="dialog" aria-modal="true" aria-label="Operation progress">
        <h3>{{ operationState.title }}</h3>
        <p class="muted">{{ operationState.message }}</p>
        <div class="progress-row">
          <div class="progress-track">
            <div
              class="progress-fill"
              role="progressbar"
              :aria-valuenow="operationProgressPercent"
              aria-valuemin="0"
              aria-valuemax="100"
              :style="{ width: `${operationProgressPercent}%` }"
            ></div>
          </div>
          <strong>{{ operationProgressPercent }}%</strong>
        </div>
        <p class="muted">{{ operationState.processed }} / {{ operationState.total }} item</p>
        <div class="form-actions">
          <button class="ghost-btn" type="button" :disabled="operationState.cancelRequested || operationState.processed >= operationState.total" @click="requestCancelOperation">
            {{ operationState.cancelRequested ? 'Cancelling...' : 'Cancel' }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { apiClient } from '../services/api/client'
import { useCourseManagementStore } from '../stores/courseManagement'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

const courseStore = useCourseManagementStore()
const router = useRouter()
const profileStore = useProfileStore()
const toastStore = useToastStore()
const { courseSummaries, editor, isLoading, isSaving, auditLogs, permissions, revisions, revisionsLoading } = storeToRefs(courseStore)
const { profile } = storeToRefs(profileStore)

const searchKeyword = ref('')
const statusFilter = ref('all')
const sortKey = ref('updatedAt')
const sortDir = ref('desc')
const page = ref(1)
const pageSize = ref(10)
const isPreviewMode = ref(false)
const showAdvancedInputs = ref(true)
const basicWizardStep = ref(1)
const draggingModuleIndex = ref(null)
const draggingLesson = ref(null)
const autosaveTimerId = ref(null)
const autosaveErrorShown = ref(false)
const lastSavedHash = ref('')
const selectedIds = ref([])
const importInputRef = ref(null)
const thumbnailInputRef = ref(null)
const thumbnailPreviewSrc = ref('')
const articleFileInputRefs = ref({})
const quizCatalogOptions = ref([])
const focusedDependencyNodeId = ref('')
const dependencyNodeQuery = ref('')
const dependencyViewMode = ref('all')
const isImporting = ref(false)
const isBulkBusy = ref(false)
const isStorageCleanupRunning = ref(false)
const importReport = ref(null)
const a11yLiveMessage = ref('')
const a11yTimerId = ref(null)
const telemetryEvents = ref([])
const telemetryLoading = ref(false)
const telemetryLimit = ref(120)
const telemetrySeverityFilter = ref('all')
const telemetryQuery = ref('')
const telemetryAutoRefresh = ref(false)
const telemetryRefreshTimerId = ref(null)
const revisionDiffBaseId = ref('__current__')
const revisionDiffTargetId = ref('')
const activeLocale = ref('id')
const localizedDraft = ref({ title: '', description: '' })
const contentIntegrityReport = ref({
  brokenLinks: [],
  duplicateLessonIds: [],
  orphanModules: [],
  coverageIssues: [],
  lastRunAt: '',
})
const bulkJobHistory = ref([])
const immutableAuditEvents = ref([])
const immutableAuditVerify = ref({
  ok: true,
  brokenAt: -1,
  total: 0,
  lastHash: '',
})
const immutableAuditLoading = ref(false)
const notificationChannels = ref({
  webhookEnabled: false,
  webhookUrl: '',
  emailEnabled: false,
  emailFrom: 'no-reply@curiosity.app',
})
const notificationDeliveryLogs = ref([])
const bulkQueue = ref([])
const bulkQueueDlq = ref([])
const queueWorkerLease = ref(null)
const bulkQueueAutoRun = ref(true)
const bulkQueueWorkerBusy = ref(false)
const bulkQueueTimerId = ref(null)
const complianceExportBusy = ref(false)
const importOptions = ref({
  dryRun: false,
  atomic: false,
})
const operationState = ref({
  active: false,
  title: '',
  message: '',
  processed: 0,
  total: 0,
  cancelRequested: false,
})
const saveState = ref({
  mode: 'idle',
  label: 'Idle',
  message: '',
  lastManualAt: '',
  lastAutoAt: '',
  conflictCount: 0,
})
const pendingConflictDraft = ref(null)
const assetDraft = ref({
  name: '',
  type: 'file',
  url: '',
})
const dependencyViewModes = [
  { value: 'all', label: 'Show All' },
  { value: 'upstream', label: 'Upstream Only' },
  { value: 'downstream', label: 'Downstream Only' },
]

const scheduleForm = ref({
  publishAt: '',
  unpublishAt: '',
})

const filteredCourses = computed(() => {
  const q = searchKeyword.value.trim().toLowerCase()
  const base = courseSummaries.value.filter((course) => {
    if (statusFilter.value !== 'all' && course.status !== statusFilter.value) return false
    if (!q) return true
    return [course.title, course.id, course.slug, course.category, course.level].some((value) => String(value || '').toLowerCase().includes(q))
  })

  const sorted = [...base].sort((a, b) => {
    if (sortKey.value === 'title') return String(a.title || '').localeCompare(String(b.title || ''))
    if (sortKey.value === 'status') return String(a.status || '').localeCompare(String(b.status || ''))
    if (sortKey.value === 'lessonCount') return Number(a.lessonCount || 0) - Number(b.lessonCount || 0)
    return Date.parse(a.updatedAt || 0) - Date.parse(b.updatedAt || 0)
  })

  return sortDir.value === 'asc' ? sorted : sorted.reverse()
})
const basicWizard = computed(() => ({
  step: Math.max(1, Math.min(3, Number(basicWizardStep.value || 1))),
}))

const totalPages = computed(() => Math.max(1, Math.ceil(filteredCourses.value.length / pageSize.value)))

const paginatedCourses = computed(() => {
  const safePage = Math.min(page.value, totalPages.value)
  const start = (safePage - 1) * pageSize.value
  return filteredCourses.value.slice(start, start + pageSize.value)
})

const checklist = computed(() => courseStore.getPublishChecklist(editor.value))
const canPublish = computed(() => checklist.value.every((item) => item.passed))
const validationMessages = computed(() => checklist.value.filter((item) => !item.passed).map((item) => item.label))
const basicFieldErrors = computed(() => {
  const errors = {}
  if (!String(editor.value.slug || '').trim()) errors.slug = 'Slug wajib diisi.'
  if (!String(editor.value.title || '').trim()) errors.title = 'Title wajib diisi.'
  const firstModule = editor.value.modules?.[0]
  const firstLesson = firstModule?.lessons?.[0]
  if (!String(firstModule?.title || '').trim()) errors.moduleTitle = 'Module title wajib diisi.'
  if (!String(firstLesson?.title || '').trim()) errors.lessonTitle = 'Lesson title wajib diisi.'
  if (!Number.isFinite(Number(firstLesson?.durationMin)) || Number(firstLesson?.durationMin) < 1) {
    errors.lessonDuration = 'Duration minimal 1 menit.'
  }
  return errors
})
const editorHash = computed(() => JSON.stringify(editor.value || {}))
const hasUnsavedChanges = computed(() => editorHash.value !== lastSavedHash.value)
const canEditCourse = computed(() => Boolean(permissions.value?.edit || permissions.value?.create))
const canCreateCourse = computed(() => Boolean(permissions.value?.create))
const canDeleteCourse = computed(() => Boolean(permissions.value?.delete))
const canBulkCourse = computed(() => Boolean(permissions.value?.bulk))
const canImportExportCourse = computed(() => Boolean(permissions.value?.importExport))
const canPublishCourse = computed(() => Boolean(permissions.value?.publish))
const canScheduleCourse = computed(() => Boolean(permissions.value?.schedule))
const canDuplicateCourse = computed(() => Boolean(permissions.value?.duplicate))
const canViewHistory = computed(() => Boolean(permissions.value?.history))
const canRestoreRevision = computed(() => Boolean(permissions.value?.restoreRevision))
const isAdminRole = computed(() => String(profile.value?.accessRole || '').toLowerCase() === 'admin')
const isPageSelected = computed(() => {
  if (!paginatedCourses.value.length) return false
  return paginatedCourses.value.every((course) => selectedIds.value.includes(course.id))
})
const recentAuditLogs = computed(() => auditLogs.value.slice(0, 12))
const filteredTelemetryEvents = computed(() => {
  const q = telemetryQuery.value.trim().toLowerCase()
  return telemetryEvents.value.filter((item) => {
    if (telemetrySeverityFilter.value !== 'all' && item.severity !== telemetrySeverityFilter.value) return false
    if (!q) return true
    return [
      item.action,
      item.message,
      item.context?.courseId,
      item.context?.operation,
      item.actorEmail,
      item.actorId,
    ]
      .map((value) => String(value || '').toLowerCase())
      .some((value) => value.includes(q))
  })
})
const telemetrySummary = computed(() => ({
  total: filteredTelemetryEvents.value.length,
  info: filteredTelemetryEvents.value.filter((item) => item.severity === 'info').length,
  warning: filteredTelemetryEvents.value.filter((item) => item.severity === 'warning').length,
  error: filteredTelemetryEvents.value.filter((item) => item.severity === 'error').length,
  latestAt: filteredTelemetryEvents.value[0]?.createdAt || '',
}))
const revisionDiffOptions = computed(() => [
  { id: '__current__', label: `Current Editor (${editor.value.title || editor.value.id || 'new'})` },
  ...revisions.value.map((item) => ({
    id: item.id,
    label: `${formatDateTime(item.createdAt)} · ${item.action} · v${item.version}`,
  })),
])
const revisionDiffSnapshots = computed(() => {
  const snapshots = {
    __current__: editor.value,
  }
  revisions.value.forEach((item) => {
    snapshots[item.id] = item.snapshot || null
  })
  return snapshots
})
const revisionDiffBaseSnapshot = computed(() => revisionDiffSnapshots.value[revisionDiffBaseId.value] || null)
const revisionDiffTargetSnapshot = computed(() => revisionDiffSnapshots.value[revisionDiffTargetId.value] || null)
const prerequisiteCsv = computed({
  get: () => (editor.value.settings?.prerequisiteCourseIds || []).join(', '),
  set: (value) => {
    const nextIds = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    editor.value.settings.prerequisiteCourseIds = [...new Set(nextIds)]
  },
})
const csvModel = (getter, setter) =>
  computed({
    get: () => getter(),
    set: (value) => setter(String(value || '')),
  })
const parseCsv = (value) =>
  [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))]
const approverCsv = csvModel(
  () => (editor.value.settings?.approverUserIds || []).join(', '),
  (value) => {
    editor.value.settings.approverUserIds = parseCsv(value)
  },
)
const tagsCsv = csvModel(
  () => (editor.value.settings?.tags || []).join(', '),
  (value) => {
    editor.value.settings.tags = parseCsv(value)
  },
)
const ownerCsv = csvModel(
  () => (editor.value.settings?.ownerUserIds || []).join(', '),
  (value) => {
    editor.value.settings.ownerUserIds = parseCsv(value)
  },
)
const editorCsv = csvModel(
  () => (editor.value.settings?.editorUserIds || []).join(', '),
  (value) => {
    editor.value.settings.editorUserIds = parseCsv(value)
  },
)
const localeCsv = csvModel(
  () => (editor.value.settings?.locales || ['id']).join(', '),
  (value) => {
    const parsed = parseCsv(value).map((item) => item.toLowerCase())
    editor.value.settings.locales = parsed.length ? parsed : ['id']
    if (!editor.value.settings.locales.includes(activeLocale.value)) {
      activeLocale.value = editor.value.settings.locales[0]
    }
    if (!editor.value.settings.locales.includes(editor.value.settings.localeFallback)) {
      editor.value.settings.localeFallback = editor.value.settings.locales[0] || 'id'
    }
  },
)
const localeOptions = computed(() => {
  const locales = Array.isArray(editor.value.settings?.locales) && editor.value.settings.locales.length ? editor.value.settings.locales : ['id']
  return [...new Set(locales.map((item) => String(item || 'id').toLowerCase()))]
})
const publishedQuizOptions = computed(() =>
  (Array.isArray(quizCatalogOptions.value) ? quizCatalogOptions.value : [])
    .filter((quiz) => String(quiz.status || 'published') === 'published')
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))),
)
const toSlug = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const prerequisiteCourseOptions = computed(() => {
  const selectedSet = new Set(editor.value.settings?.prerequisiteCourseIds || [])
  return courseSummaries.value
    .filter((course) => course.id !== editor.value.id)
    .slice(0, 16)
    .map((course) => ({
      id: course.id,
      title: course.title,
      selected: selectedSet.has(course.id),
    }))
})
const dependencyInsight = computed(() => courseStore.getCourseDependencyInsight(editor.value))
const dependencyCycleText = computed(() =>
  (dependencyInsight.value.cyclePath || [])
    .map((courseId) => {
      const item = courseSummaries.value.find((course) => course.id === courseId)
      return item?.title || courseId
    })
    .join(' -> '),
)
const dependencyGraph = computed(() => {
  const upstreamAll = dependencyInsight.value.upstream || []
  const downstreamAll = dependencyInsight.value.downstream || []
  const upstream = dependencyViewMode.value === 'downstream' ? [] : upstreamAll
  const downstream = dependencyViewMode.value === 'upstream' ? [] : downstreamAll
  const invalidRefs = dependencyInsight.value.invalidRefs || []
  const cycleSet = new Set(dependencyInsight.value.cyclePath || [])
  const focusId = focusedDependencyNodeId.value
  const centerId = editor.value.id || ''
  const searchKeyword = dependencyNodeQuery.value.trim().toLowerCase()
  const titleMap = new Map(courseSummaries.value.map((course) => [course.id, course.title || course.id]))
  const upstreamNodes = [...upstream, ...invalidRefs.filter((id) => !upstream.includes(id) && dependencyViewMode.value !== 'downstream')]
  const rowCount = Math.max(1, upstreamNodes.length, downstream.length)
  const rowHeight = 74
  const height = Math.max(220, rowCount * rowHeight + 64)
  const startY = 42
  const spread = rowCount > 1 ? (height - startY * 2) / (rowCount - 1) : 0
  const nodes = []
  const edges = []
  const centerY = rowCount > 1 ? startY + ((rowCount - 1) * spread) / 2 : height / 2

  nodes.push({
    key: `node-center-${centerId || 'new'}`,
    x: 500,
    y: centerY,
    courseId: centerId,
    label: editor.value.title || centerId || 'Current Course',
    kind: 'center',
    invalid: false,
    cycle: cycleSet.has(centerId),
    selected: false,
    clickable: false,
    focused: focusId && focusId === centerId,
    matched: !searchKeyword || String(editor.value.title || centerId || '').toLowerCase().includes(searchKeyword) || String(centerId).toLowerCase().includes(searchKeyword),
    dim: false,
  })

  upstreamNodes.forEach((id, index) => {
    const y = rowCount > 1 ? startY + index * spread : centerY
    nodes.push({
      key: `node-up-${id}-${index}`,
      x: 220,
      y,
      courseId: id,
      label: titleMap.get(id) || id,
      kind: 'upstream',
      invalid: invalidRefs.includes(id),
      cycle: cycleSet.has(id),
      selected: upstream.includes(id),
      clickable: true,
      focused: focusId && focusId === id,
      matched: !searchKeyword || String(titleMap.get(id) || id).toLowerCase().includes(searchKeyword) || String(id).toLowerCase().includes(searchKeyword),
      dim: false,
    })
    edges.push({
      key: `edge-up-${id}-${index}`,
      x1: 340,
      y1: y,
      x2: 380,
      y2: centerY,
      fromId: id,
      toId: centerId,
      kind: invalidRefs.includes(id) ? 'invalid' : 'normal',
      dim: false,
    })
  })

  downstream.forEach((id, index) => {
    const y = rowCount > 1 ? startY + index * spread : centerY
    nodes.push({
      key: `node-down-${id}-${index}`,
      x: 780,
      y,
      courseId: id,
      label: titleMap.get(id) || id,
      kind: 'downstream',
      invalid: false,
      cycle: cycleSet.has(id),
      selected: upstream.includes(id),
      clickable: true,
      focused: focusId && focusId === id,
      matched: !searchKeyword || String(titleMap.get(id) || id).toLowerCase().includes(searchKeyword) || String(id).toLowerCase().includes(searchKeyword),
      dim: false,
    })
    edges.push({
      key: `edge-down-${id}-${index}`,
      x1: 620,
      y1: centerY,
      x2: 660,
      y2: y,
      fromId: centerId,
      toId: id,
      kind: 'normal',
      dim: false,
    })
  })

  if (focusId) {
    const highlightedNodes = new Set([focusId, centerId])
    const highlightedEdges = new Set()

    if (focusId === centerId) {
      nodes.forEach((node) => highlightedNodes.add(node.courseId))
      edges.forEach((edge) => highlightedEdges.add(edge.key))
    } else if (upstreamAll.includes(focusId)) {
      downstream.forEach((id) => highlightedNodes.add(id))
      edges.forEach((edge) => {
        if ((edge.fromId === focusId && edge.toId === centerId) || (edge.fromId === centerId && downstream.includes(edge.toId))) {
          highlightedEdges.add(edge.key)
        }
      })
    } else if (downstreamAll.includes(focusId)) {
      upstream.forEach((id) => highlightedNodes.add(id))
      edges.forEach((edge) => {
        if ((edge.fromId === centerId && edge.toId === focusId) || (upstream.includes(edge.fromId) && edge.toId === centerId)) {
          highlightedEdges.add(edge.key)
        }
      })
    }

    nodes.forEach((node) => {
      node.dim = !highlightedNodes.has(node.courseId)
      node.focused = node.courseId === focusId
    })
    edges.forEach((edge) => {
      edge.dim = !highlightedEdges.has(edge.key)
    })
  }

  return { height, nodes, edges }
})
const dependencySearchResults = computed(() => {
  const q = dependencyNodeQuery.value.trim().toLowerCase()
  if (!q) return []
  const unique = new Map()
  dependencyGraph.value.nodes.forEach((node) => {
    if (!node?.courseId) return
    const id = String(node.courseId)
    const title = String(node.label || id)
    const hit = id.toLowerCase().includes(q) || title.toLowerCase().includes(q)
    if (!hit) return
    if (unique.has(id)) return
    unique.set(id, { id, title })
  })
  return [...unique.values()].slice(0, 8)
})
const dependencyFocusLabel = computed(() => {
  if (!focusedDependencyNodeId.value) return ''
  if (focusedDependencyNodeId.value === editor.value.id) return editor.value.title || editor.value.id || 'Current Course'
  const option = prerequisiteCourseOptions.value.find((item) => item.id === focusedDependencyNodeId.value)
  if (option) return option.title || option.id
  const summary = courseSummaries.value.find((item) => item.id === focusedDependencyNodeId.value)
  return summary?.title || focusedDependencyNodeId.value
})
const focusedDependencyNode = computed(() => {
  const id = focusedDependencyNodeId.value
  if (!id) return null
  const isCurrent = id === editor.value.id
  const relationLabel = isCurrent ? 'Current Course' : dependencyInsight.value.upstream.includes(id) ? 'Upstream Prerequisite' : 'Downstream Dependent'
  const selected = (editor.value.settings?.prerequisiteCourseIds || []).includes(id)
  if (isCurrent) {
    return {
      id,
      title: editor.value.title || id || 'Current Course',
      status: editor.value.status || '-',
      level: editor.value.level || '-',
      moduleCount: editor.value.modules?.length || 0,
      lessonCount: totalLessons.value,
      relationLabel,
      selected: false,
      isCurrent: true,
      exists: true,
    }
  }
  const summary = courseSummaries.value.find((item) => item.id === id)
  if (!summary) {
    return {
      id,
      title: id,
      status: 'unknown',
      level: '-',
      moduleCount: 0,
      lessonCount: 0,
      relationLabel,
      selected,
      isCurrent: false,
      exists: false,
    }
  }
  return {
    id,
    title: summary.title || summary.id,
    status: summary.status || '-',
    level: summary.level || '-',
    moduleCount: summary.moduleCount || 0,
    lessonCount: summary.lessonCount || 0,
    relationLabel,
    selected,
    isCurrent: false,
    exists: true,
  }
})
const setDependencyViewMode = (mode) => {
  const allowed = new Set(dependencyViewModes.map((item) => item.value))
  if (!allowed.has(mode)) return
  dependencyViewMode.value = mode
  try {
    window.localStorage.setItem('cm_dependency_view_mode', mode)
  } catch {
    // ignore persistence errors
  }
}
const operationProgressPercent = computed(() => {
  const total = Math.max(1, Number(operationState.value.total || 0))
  const processed = Math.max(0, Number(operationState.value.processed || 0))
  return Math.min(100, Math.round((processed / total) * 100))
})
const BULK_QUEUE_STORAGE_KEY = 'curiosity:lms:course-bulk-queue:v1'
const ADVANCED_INPUT_TOGGLE_KEY = 'cm_show_advanced_inputs'

const totalLessons = computed(() => (editor.value.modules || []).reduce((sum, module) => sum + (module.lessons || []).length, 0))
const totalDuration = computed(() =>
  (editor.value.modules || []).reduce(
    (sum, module) => sum + (module.lessons || []).reduce((lessonSum, lesson) => lessonSum + Number(lesson.durationMin || 0), 0),
    0,
  ),
)
const toDiffSnapshot = (source) => {
  const course = source && typeof source === 'object' ? source : {}
  const modules = Array.isArray(course.modules) ? course.modules : []
  const lessons = modules.flatMap((module) => (module.lessons || []).map((lesson) => ({ ...lesson, moduleId: module.id || '' })))
  return {
    title: String(course.title || ''),
    slug: String(course.slug || ''),
    status: String(course.status || ''),
    category: String(course.category || ''),
    level: String(course.level || ''),
    language: String(course.language || ''),
    visibility: String(course.visibility || ''),
    publishAt: String(course.publishAt || ''),
    unpublishAt: String(course.unpublishAt || ''),
    moduleCount: modules.length,
    lessonCount: lessons.length,
    assetCount: Array.isArray(course.assets) ? course.assets.length : 0,
    prerequisiteCount: Array.isArray(course.settings?.prerequisiteCourseIds) ? course.settings.prerequisiteCourseIds.length : 0,
    completionMode: String(course.settings?.completionMode || ''),
    completionThresholdPercent: Number(course.settings?.completionThresholdPercent || 0),
    maxRetake: Number(course.settings?.maxRetake || 0),
  }
}
const revisionDiffRows = computed(() => {
  const base = toDiffSnapshot(revisionDiffBaseSnapshot.value)
  const target = toDiffSnapshot(revisionDiffTargetSnapshot.value)
  return Object.keys(base).reduce((rows, key) => {
    if (String(base[key]) === String(target[key])) return rows
    rows.push({
      key,
      label: key,
      before: String(base[key] ?? '-'),
      after: String(target[key] ?? '-'),
    })
    return rows
  }, [])
})
const revisionDiffSummary = computed(() => {
  const base = toDiffSnapshot(revisionDiffBaseSnapshot.value)
  const target = toDiffSnapshot(revisionDiffTargetSnapshot.value)
  return {
    changedFields: revisionDiffRows.value.length,
    moduleDelta: Number(target.moduleCount || 0) - Number(base.moduleCount || 0),
    lessonDelta: Number(target.lessonCount || 0) - Number(base.lessonCount || 0),
    assetDelta: Number(target.assetCount || 0) - Number(base.assetCount || 0),
    prerequisiteDelta: Number(target.prerequisiteCount || 0) - Number(base.prerequisiteCount || 0),
  }
})
const safeJsonPreview = (value) => {
  try {
    return JSON.stringify(value || {}, null, 2)
  } catch {
    return '{}'
  }
}
const revisionDiffBasePreview = computed(() => safeJsonPreview(revisionDiffBaseSnapshot.value))
const revisionDiffTargetPreview = computed(() => safeJsonPreview(revisionDiffTargetSnapshot.value))
const toIdSet = (list = []) => new Set((Array.isArray(list) ? list : []).map((item) => String(item || '')))
const diffIdSet = (baseSet, targetSet) => ({
  added: [...targetSet].filter((id) => !baseSet.has(id)),
  removed: [...baseSet].filter((id) => !targetSet.has(id)),
})
const revisionStructureDiff = computed(() => {
  const base = revisionDiffBaseSnapshot.value || {}
  const target = revisionDiffTargetSnapshot.value || {}
  const baseModuleIds = toIdSet((base.modules || []).map((module) => module.id))
  const targetModuleIds = toIdSet((target.modules || []).map((module) => module.id))
  const baseLessonIds = toIdSet((base.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => `${module.id || ''}:${lesson.id || ''}`)))
  const targetLessonIds = toIdSet((target.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => `${module.id || ''}:${lesson.id || ''}`)))
  const baseAssetIds = toIdSet((base.assets || []).map((asset) => asset.id))
  const targetAssetIds = toIdSet((target.assets || []).map((asset) => asset.id))
  const basePrerequisiteIds = toIdSet(base.settings?.prerequisiteCourseIds || [])
  const targetPrerequisiteIds = toIdSet(target.settings?.prerequisiteCourseIds || [])
  return {
    modules: diffIdSet(baseModuleIds, targetModuleIds),
    lessons: diffIdSet(baseLessonIds, targetLessonIds),
    assets: diffIdSet(baseAssetIds, targetAssetIds),
    prerequisites: diffIdSet(basePrerequisiteIds, targetPrerequisiteIds),
  }
})
const authorAnalytics = computed(() => {
  const now = Date.now()
  const courses = courseSummaries.value || []
  const draftCourses = courses.filter((course) => course.status === 'draft')
  const publishedCourses = courses.filter((course) => course.status === 'published')
  const draftAges = draftCourses.map((course) => {
    const ms = Date.parse(course.updatedAt || '')
    if (!Number.isFinite(ms)) return 0
    return Math.max(0, (now - ms) / (1000 * 60 * 60 * 24))
  })
  const avgDraftAgeDays = draftAges.length ? Math.round((draftAges.reduce((sum, value) => sum + value, 0) / draftAges.length) * 10) / 10 : 0
  const checklistTotals = courses.map((course) => {
    const checks = courseStore.getPublishChecklist(course)
    const failed = checks.filter((item) => !item.passed).length
    return { total: checks.length, failed }
  })
  const checklistFailureRate = checklistTotals.length
    ? Math.round(
        (checklistTotals.reduce((sum, item) => sum + item.failed, 0) / Math.max(1, checklistTotals.reduce((sum, item) => sum + item.total, 0))) * 100,
      )
    : 0
  const orphanModules = courses.reduce((sum, course) => {
    const hasOrphan = (courseStore.getCourseDependencyInsight(course).invalidRefs || []).length > 0
    return sum + (hasOrphan ? 1 : 0)
  }, 0)
  const orphanContentRatio = courses.length ? Math.round((orphanModules / courses.length) * 100) : 0
  return {
    draftCount: draftCourses.length,
    publishedCount: publishedCourses.length,
    avgDraftAgeDays,
    checklistFailureRate,
    orphanContentRatio,
  }
})

const statusClass = (status) => {
  if (status === 'published') return 'status-active'
  if (status === 'archived') return 'status-suspended'
  if (status === 'scheduled') return 'status-pending'
  return 'status-pending'
}

const togglePrerequisiteCourse = (courseId) => {
  if (!canEditCourse.value) return
  const current = new Set(editor.value.settings?.prerequisiteCourseIds || [])
  if (current.has(courseId)) {
    current.delete(courseId)
  } else {
    current.add(courseId)
  }
  editor.value.settings.prerequisiteCourseIds = [...current]
}

const onDependencyNodeClick = (node, event = null) => {
  if (!node?.clickable || !node.courseId) return
  if (node.courseId === editor.value.id) return
  const isToggleMode = Boolean(event?.metaKey || event?.ctrlKey)
  if (isToggleMode) {
    if (!canEditCourse.value) return
    togglePrerequisiteCourse(node.courseId)
    const selectedSet = new Set(editor.value.settings?.prerequisiteCourseIds || [])
    const isSelected = selectedSet.has(node.courseId)
    pushManagedToast({
      type: 'info',
      title: isSelected ? 'Prerequisite Added' : 'Prerequisite Removed',
      message: `${node.label || node.courseId} ${isSelected ? 'ditambahkan' : 'dihapus'} dari prerequisite.`,
    })
    return
  }
  focusedDependencyNodeId.value = focusedDependencyNodeId.value === node.courseId ? '' : node.courseId
}

const clearDependencyFocus = () => {
  focusedDependencyNodeId.value = ''
}

const focusDependencyNode = (courseId) => {
  if (!courseId) return
  focusedDependencyNodeId.value = String(courseId)
}

const focusFirstDependencySearchResult = () => {
  const first = dependencySearchResults.value[0]
  if (!first) return
  focusDependencyNode(first.id)
}

const openFocusedDependencyCourse = () => {
  const targetId = focusedDependencyNode.value?.id
  if (!targetId || targetId === editor.value.id) return
  openEditor(targetId)
}

const toggleFocusedDependencyPrerequisite = () => {
  const targetId = focusedDependencyNode.value?.id
  if (!targetId || targetId === editor.value.id || !canEditCourse.value) return
  togglePrerequisiteCourse(targetId)
}

const applyLocalizedDraft = () => {
  const locale = String(activeLocale.value || '').trim().toLowerCase() || 'id'
  const current = editor.value.settings?.localizedContent && typeof editor.value.settings.localizedContent === 'object' ? editor.value.settings.localizedContent : {}
  editor.value.settings.localizedContent = {
    ...current,
    [locale]: {
      title: String(localizedDraft.value.title || '').trim(),
      description: String(localizedDraft.value.description || '').trim(),
    },
  }
  pushManagedToast(
    {
      type: 'success',
      title: 'Localized Copy Updated',
      message: `Konten locale ${locale} diperbarui.`,
    },
    { action: 'localized-copy-updated', operation: 'Localization' },
  )
}

const runContentIntegrityScan = () => {
  const modules = Array.isArray(editor.value.modules) ? editor.value.modules : []
  const lessons = modules.flatMap((module) => (module.lessons || []).map((lesson) => ({ ...lesson, moduleId: module.id })))
  const brokenLinks = lessons.filter((lesson) => lesson.contentUrl && !/^https?:\/\//i.test(lesson.contentUrl)).map((lesson) => lesson.id)
  const lessonIdCount = new Map()
  lessons.forEach((lesson) => {
    const key = String(lesson.id || '')
    lessonIdCount.set(key, (lessonIdCount.get(key) || 0) + 1)
  })
  const duplicateLessonIds = [...lessonIdCount.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  const orphanModules = modules.filter((module) => !(module.lessons || []).length).map((module) => module.id)
  const coverageIssues = modules
    .filter((module) => !(module.lessons || []).some((lesson) => lesson.isPreview))
    .map((module) => `${module.id}: missing preview`)
  contentIntegrityReport.value = {
    brokenLinks,
    duplicateLessonIds,
    orphanModules,
    coverageIssues,
    lastRunAt: new Date().toISOString(),
  }
  const issueCount = brokenLinks.length + duplicateLessonIds.length + orphanModules.length + coverageIssues.length
  pushManagedToast(
    {
      type: issueCount ? 'warning' : 'success',
      title: 'Integrity Scan Complete',
      message: issueCount ? `${issueCount} issue ditemukan. Periksa detail scanner.` : 'Tidak ada issue integrity.',
    },
    {
      action: 'integrity-scan',
      operation: 'Content Integrity Scan',
      severity: issueCount ? 'warning' : 'info',
      meta: { issueCount },
    },
  )
}

const exportAuditJson = () => {
  downloadJson(`course-audit-${new Date().toISOString().slice(0, 10)}.json`, recentAuditLogs.value)
}

const exportAuditCsv = () => {
  const header = ['timestamp', 'action', 'courseId', 'courseTitle', 'detail']
  const rows = recentAuditLogs.value.map((item) =>
    [item.createdAt, item.action, item.courseId, item.courseTitle, String(item.detail || '').replaceAll('"', '""')]
      .map((value) => `"${String(value || '')}"`)
      .join(','),
  )
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `course-audit-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const addBulkJobHistory = (payload) => {
  const job = {
    id: `job-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    ...payload,
  }
  bulkJobHistory.value = [job, ...bulkJobHistory.value].slice(0, 50)
}

const retryBulkJob = async (jobId) => {
  const job = bulkJobHistory.value.find((item) => item.id === jobId)
  if (!job) return
  if (!Array.isArray(job.ids) || !job.ids.length) return
  if (job.type === 'bulk-status' && job.statusValue) {
    await runBulkStatus(job.statusValue)
    return
  }
  if (job.type === 'bulk-delete') {
    await runBulkDelete()
    return
  }
  if (job.type === 'bulk-auto-prerequisite') {
    await runBulkAutoPrerequisite()
    return
  }
  if (job.type === 'bulk-clear-prerequisite') {
    await runBulkClearPrerequisite()
  }
}

const saveBulkQueue = () => {
  try {
    window.localStorage.setItem(BULK_QUEUE_STORAGE_KEY, JSON.stringify(bulkQueue.value))
  } catch {
    // ignore persistence error
  }
}

const loadBulkQueue = () => {
  try {
    const raw = window.localStorage.getItem(BULK_QUEUE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    bulkQueue.value = Array.isArray(parsed) ? parsed : []
  } catch {
    bulkQueue.value = []
  }
}

const refreshQueueState = async () => {
  if (!apiClient.courseManagement?.listJobs) {
    loadBulkQueue()
    return
  }
  const [items, dlqItems, workerLease] = await Promise.all([
    apiClient.courseManagement.listJobs(200),
    apiClient.courseManagement.listDlq ? apiClient.courseManagement.listDlq(120) : Promise.resolve([]),
    apiClient.courseManagement.getWorkerLease ? apiClient.courseManagement.getWorkerLease() : Promise.resolve(null),
  ])
  bulkQueue.value = Array.isArray(items) ? items : []
  bulkQueueDlq.value = Array.isArray(dlqItems) ? dlqItems : []
  queueWorkerLease.value = workerLease || null
}

const queueBulkJob = (type, payload = {}) => {
  const ids = [...new Set((payload.ids || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return
  if (apiClient.courseManagement?.enqueueJob && apiClient.courseManagement?.listJobs) {
    apiClient.courseManagement
      .enqueueJob({
        type,
        ids,
        statusValue: payload.statusValue || '',
      })
      .then(async () => {
        await refreshQueueState()
        pushManagedToast({
          type: 'info',
          title: 'Bulk Job Queued',
          message: `${type} masuk server queue (${ids.length} item).`,
        })
        processBulkQueueNow().catch(() => {})
      })
      .catch((error) => showCourseActionError('Queue Bulk Job Failed', error))
    return
  }
  const item = {
    id: `queue-${Math.random().toString(36).slice(2, 10)}`,
    type,
    ids,
    statusValue: payload.statusValue || '',
    status: 'pending',
    attempts: 0,
    processed: 0,
    total: ids.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRunAt: '',
    errorMessage: '',
  }
  bulkQueue.value = [item, ...bulkQueue.value].slice(0, 200)
  saveBulkQueue()
  pushManagedToast({
    type: 'info',
    title: 'Bulk Job Queued',
    message: `${type} masuk queue (${ids.length} item).`,
  })
  processBulkQueueNow().catch(() => {})
}

const executeQueueJob = async (job) => {
  if (!job || !Array.isArray(job.ids) || !job.ids.length) {
    return { processed: 0, total: 0, cancelled: true }
  }
  if (job.type === 'bulk-status') {
    return courseStore.bulkSetStatus(job.ids, job.statusValue || 'draft')
  }
  if (job.type === 'bulk-delete') {
    return courseStore.bulkDelete(job.ids)
  }
  if (job.type === 'bulk-auto-prerequisite') {
    return courseStore.bulkAutoSuggestPrerequisites(job.ids)
  }
  if (job.type === 'bulk-clear-prerequisite') {
    return courseStore.bulkSetPrerequisites(job.ids, [], 'replace')
  }
  throw new Error('Unknown queue job type.')
}

const processBulkQueueNow = async () => {
  if (apiClient.courseManagement?.processDueJobs && apiClient.courseManagement?.listJobs) {
    if (bulkQueueWorkerBusy.value) return
    bulkQueueWorkerBusy.value = true
    try {
      await apiClient.courseManagement.processDueJobs()
      await refreshQueueState()
    } catch (error) {
      showCourseActionError('Process Bulk Queue Failed', error)
    } finally {
      bulkQueueWorkerBusy.value = false
    }
    return
  }
  if (bulkQueueWorkerBusy.value) return
  const now = Date.now()
  const nextJob = bulkQueue.value.find(
    (job) =>
      (job.status === 'pending' || job.status === 'retrying') &&
      (!job.nextRunAt || !Number.isFinite(Date.parse(job.nextRunAt)) || Date.parse(job.nextRunAt) <= now),
  )
  if (!nextJob) return

  bulkQueueWorkerBusy.value = true
  nextJob.status = 'running'
  nextJob.updatedAt = new Date().toISOString()
  saveBulkQueue()
  try {
    const result = await executeQueueJob(nextJob)
    nextJob.status = result.cancelled ? 'partial' : 'completed'
    nextJob.processed = Number(result.processed || 0)
    nextJob.total = Number(result.total || nextJob.total || 0)
    nextJob.errorMessage = ''
    nextJob.updatedAt = new Date().toISOString()
    addBulkJobHistory({
      type: nextJob.type,
      status: nextJob.status,
      ids: nextJob.ids,
      processed: nextJob.processed,
      total: nextJob.total,
      statusValue: nextJob.statusValue || '',
    })
  } catch (error) {
    const attempts = Number(nextJob.attempts || 0) + 1
    nextJob.attempts = attempts
    nextJob.errorMessage = error?.message || 'Queue execution failed.'
    if (attempts >= 3) {
      nextJob.status = 'failed'
      nextJob.nextRunAt = ''
    } else {
      nextJob.status = 'retrying'
      nextJob.nextRunAt = new Date(Date.now() + attempts * 5000).toISOString()
    }
    nextJob.updatedAt = new Date().toISOString()
  } finally {
    saveBulkQueue()
    bulkQueueWorkerBusy.value = false
  }
}

const runSingleQueuedJob = async (jobId) => {
  if (apiClient.courseManagement?.runJob && apiClient.courseManagement?.listJobs) {
    try {
      await apiClient.courseManagement.runJob(jobId)
      await refreshQueueState()
    } catch (error) {
      showCourseActionError('Run Queue Job Failed', error)
    }
    return
  }
  const target = bulkQueue.value.find((job) => job.id === jobId)
  if (!target || target.status === 'running') return
  target.status = 'pending'
  target.nextRunAt = ''
  saveBulkQueue()
  await processBulkQueueNow()
}

const clearCompletedQueueJobs = () => {
  if (apiClient.courseManagement?.removeJob && apiClient.courseManagement?.listJobs) {
    const removals = bulkQueue.value
      .filter((job) => ['completed', 'failed', 'partial'].includes(job.status))
      .map((job) => apiClient.courseManagement.removeJob(job.id).catch(() => null))
    Promise.all(removals)
      .then(() => refreshQueueState())
      .catch((error) => showCourseActionError('Clear Queue Failed', error))
    return
  }
  bulkQueue.value = bulkQueue.value.filter((job) => !['completed', 'failed', 'partial'].includes(job.status))
  saveBulkQueue()
}

const removeQueuedJob = (jobId) => {
  if (apiClient.courseManagement?.removeJob && apiClient.courseManagement?.listJobs) {
    apiClient.courseManagement
      .removeJob(jobId)
      .then(() => refreshQueueState())
      .catch((error) => showCourseActionError('Remove Queue Job Failed', error))
    return
  }
  bulkQueue.value = bulkQueue.value.filter((job) => job.id !== jobId)
  saveBulkQueue()
}

const redriveDlqItem = async (dlqId) => {
  if (!apiClient.courseManagement?.redriveDlq) return
  try {
    await apiClient.courseManagement.redriveDlq(dlqId)
    await refreshQueueState()
    pushManagedToast({
      type: 'success',
      title: 'DLQ Redriven',
      message: 'Item DLQ dimasukkan kembali ke queue.',
    })
  } catch (error) {
    showCourseActionError('Redrive DLQ Failed', error)
  }
}

const exportComplianceBundle = async () => {
  if (!editor.value.id || !apiClient.courseManagement?.exportComplianceBundle) return
  complianceExportBusy.value = true
  try {
    const payload = await apiClient.courseManagement.exportComplianceBundle(editor.value.id)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${editor.value.id}-compliance-export.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    pushManagedToast({
      type: 'success',
      title: 'Compliance Export Ready',
      message: `Bundle compliance untuk ${editor.value.id} berhasil diexport.`,
    })
  } catch (error) {
    showCourseActionError('Compliance Export Failed', error)
  } finally {
    complianceExportBusy.value = false
  }
}

const refreshImmutableAudit = async () => {
  if (!isAdminRole.value) return
  immutableAuditLoading.value = true
  try {
    const [items, verify] = await Promise.all([
      apiClient.audit?.listImmutable ? apiClient.audit.listImmutable(120) : Promise.resolve([]),
      apiClient.audit?.verifyImmutable ? apiClient.audit.verifyImmutable() : Promise.resolve({ ok: true, total: 0, brokenAt: -1, lastHash: '' }),
    ])
    immutableAuditEvents.value = Array.isArray(items) ? items : []
    immutableAuditVerify.value = verify || { ok: true, total: 0, brokenAt: -1, lastHash: '' }
  } catch {
    immutableAuditEvents.value = []
    immutableAuditVerify.value = { ok: false, total: 0, brokenAt: 0, lastHash: '' }
  } finally {
    immutableAuditLoading.value = false
  }
}

const loadNotificationIntegration = async () => {
  if (!isAdminRole.value || !apiClient.notifications?.getChannels) return
  try {
    const [channels, logs] = await Promise.all([
      apiClient.notifications.getChannels(),
      apiClient.notifications.listDeliveryLogs ? apiClient.notifications.listDeliveryLogs(80) : Promise.resolve([]),
    ])
    notificationChannels.value = {
      webhookEnabled: Boolean(channels?.webhookEnabled),
      webhookUrl: String(channels?.webhookUrl || ''),
      emailEnabled: Boolean(channels?.emailEnabled),
      emailFrom: String(channels?.emailFrom || 'no-reply@curiosity.app'),
    }
    notificationDeliveryLogs.value = Array.isArray(logs) ? logs : []
  } catch {
    // ignore integration loading failures
  }
}

const saveNotificationChannels = async () => {
  if (!isAdminRole.value || !apiClient.notifications?.saveChannels) return
  const payload = {
    webhookEnabled: Boolean(notificationChannels.value.webhookEnabled),
    webhookUrl: String(notificationChannels.value.webhookUrl || ''),
    emailEnabled: Boolean(notificationChannels.value.emailEnabled),
    emailFrom: String(notificationChannels.value.emailFrom || 'no-reply@curiosity.app'),
  }
  try {
    const saved = await apiClient.notifications.saveChannels(payload)
    notificationChannels.value = {
      webhookEnabled: Boolean(saved?.webhookEnabled),
      webhookUrl: String(saved?.webhookUrl || ''),
      emailEnabled: Boolean(saved?.emailEnabled),
      emailFrom: String(saved?.emailFrom || 'no-reply@curiosity.app'),
    }
    pushManagedToast({
      type: 'success',
      title: 'Notification Channels Saved',
      message: 'Konfigurasi webhook/email berhasil disimpan.',
    })
  } catch (error) {
    showCourseActionError('Save Notification Channels Failed', error)
  }
}

const sendNotificationTest = async (channel) => {
  if (!isAdminRole.value || !apiClient.notifications?.testDelivery) return
  try {
    const result = await apiClient.notifications.testDelivery({
      channel: channel === 'email' ? 'email' : 'webhook',
      message: `Course management test delivery at ${new Date().toISOString()}`,
    })
    notificationDeliveryLogs.value = [result, ...notificationDeliveryLogs.value].slice(0, 120)
    pushManagedToast({
      type: result?.status === 'failed' ? 'warning' : 'info',
      title: 'Test Delivery Sent',
      message: `${result?.channel || channel} -> ${result?.status || 'queued'}`,
    })
  } catch (error) {
    showCourseActionError('Test Delivery Failed', error)
  }
}

const refreshRevisions = async () => {
  if (!canViewHistory.value || !editor.value.id) return
  try {
    await courseStore.loadRevisions(editor.value.id)
  } catch (error) {
    showCourseActionError('Load Revisions Failed', error)
  }
}

const refreshTelemetry = async () => {
  if (!isAdminRole.value || !apiClient.observability?.list) {
    telemetryEvents.value = []
    return
  }
  telemetryLoading.value = true
  try {
    const payload = await apiClient.observability.list(telemetryLimit.value)
    telemetryEvents.value = Array.isArray(payload) ? payload : []
  } catch {
    telemetryEvents.value = []
  } finally {
    telemetryLoading.value = false
  }
}

const restoreRevisionItem = async (revisionId) => {
  if (!canRestoreRevision.value || !editor.value.id) return
  if (!window.confirm('Restore revision ini? Perubahan saat ini akan digantikan.')) return
  try {
    const restored = await courseStore.restoreRevision(editor.value.id, revisionId)
    lastSavedHash.value = JSON.stringify(restored || {})
    pushManagedToast({
      type: 'success',
      title: 'Revision Restored',
      message: 'Course berhasil dikembalikan ke revision terpilih.',
    })
  } catch (error) {
    showCourseActionError('Restore Revision Failed', error)
  }
}

const autoSuggestEditorPrerequisite = () => {
  if (!canEditCourse.value) return
  const suggested = courseStore.suggestEditorPrerequisites()
  pushManagedToast({
    type: 'info',
    title: 'Prerequisite Suggested',
    message: `${suggested.length} prerequisite diterapkan otomatis berdasarkan level.`,
  })
}

const openEditor = (courseId) => {
  if (hasUnsavedChanges.value && !window.confirm('Perubahan belum disimpan. Lanjut pindah course dan abaikan perubahan?')) {
    return
  }
  courseStore.editCourse(courseId)
  isPreviewMode.value = false
}

const createNewCourse = () => {
  if (!canCreateCourse.value) return
  if (hasUnsavedChanges.value && !window.confirm('Perubahan belum disimpan. Lanjut buat course baru dan abaikan perubahan?')) {
    return
  }
  courseStore.startCreate()
  isPreviewMode.value = false
}

const addModule = () => courseStore.addModule()
const duplicateModule = (moduleIndex) => courseStore.duplicateModule(moduleIndex)
const removeModule = (moduleIndex) => courseStore.removeModule(moduleIndex)
const moveModule = (moduleIndex, direction) => courseStore.moveModule(moduleIndex, direction)
const addLesson = (moduleIndex) => courseStore.addLesson(moduleIndex)
const duplicateLesson = (moduleIndex, lessonIndex) => courseStore.duplicateLesson(moduleIndex, lessonIndex)
const removeLesson = (moduleIndex, lessonIndex) => courseStore.removeLesson(moduleIndex, lessonIndex)
const moveLesson = (moduleIndex, lessonIndex, direction) => courseStore.moveLesson(moduleIndex, lessonIndex, direction)

const announceA11y = (message) => {
  if (a11yTimerId.value) {
    window.clearTimeout(a11yTimerId.value)
  }
  a11yLiveMessage.value = ''
  a11yTimerId.value = window.setTimeout(() => {
    a11yLiveMessage.value = String(message || '')
  }, 20)
}

const trackCourseEvent = async (action, payload = {}, severity = 'info') => {
  if (!apiClient.observability?.track) return
  try {
    await apiClient.observability.track({
      domain: 'course-management',
      action,
      severity,
      message: String(payload.message || ''),
      context: {
        feature: 'manage-course',
        courseId: payload.courseId || editor.value?.id || '',
        operation: payload.operation || '',
      },
      meta: payload.meta || {},
    })
  } catch {
    // best-effort only
  }
}

const pushManagedToast = (payload, telemetry = null) => {
  const toastPayload = payload && typeof payload === 'object' ? payload : { type: 'info', title: 'Info', message: '' }
  toastStore.push(toastPayload)
  announceA11y(toastPayload.message || toastPayload.title || '')

  const fallbackSeverity = toastPayload.type === 'error' ? 'error' : toastPayload.type === 'warning' ? 'warning' : 'info'
  const telemetryPayload = telemetry && typeof telemetry === 'object' ? telemetry : {}
  const shouldTrack = telemetryPayload.track !== false
  if (!shouldTrack) return

  trackCourseEvent(
    telemetryPayload.action || `toast-${toastPayload.type || 'info'}`,
    {
      operation: telemetryPayload.operation || toastPayload.title || '',
      message: telemetryPayload.message || toastPayload.message || '',
      courseId: telemetryPayload.courseId || editor.value?.id || '',
      meta: telemetryPayload.meta || {},
    },
    telemetryPayload.severity || fallbackSeverity,
  )
}

const showCourseActionError = (title, error, fallback = 'Terjadi kesalahan pada course management.') => {
  const isConflict = error?.code === 'COURSE_CONFLICT'
  const message = isConflict ? 'Data course berubah di server. Editor sudah dimuat ulang ke versi terbaru.' : error?.messages?.[0] || error?.message || fallback
  if (isConflict) {
    saveState.value = {
      ...saveState.value,
      mode: 'error',
      label: 'Conflict',
      message: 'Versi server lebih baru. Kamu bisa re-apply draft lokal lalu simpan lagi.',
      conflictCount: Number(saveState.value.conflictCount || 0) + 1,
    }
  } else {
    saveState.value = {
      ...saveState.value,
      mode: 'error',
      label: 'Error',
      message,
    }
  }
  pushManagedToast({
    type: 'error',
    title,
    message,
  }, {
    action: 'operation-error',
    operation: title,
    severity: 'error',
  })
}

const goToBasicStep = (step) => {
  basicWizardStep.value = Math.max(1, Math.min(3, Number(step || 1)))
}

const reapplyConflictDraft = () => {
  if (!pendingConflictDraft.value) return
  editor.value = JSON.parse(JSON.stringify(pendingConflictDraft.value))
  saveState.value = {
    ...saveState.value,
    mode: 'warning',
    label: 'Draft Reapplied',
    message: 'Draft lokal dikembalikan. Simpan ulang saat siap.',
  }
}

const saveCourse = async () => {
  if (!canEditCourse.value) return
  pendingConflictDraft.value = JSON.parse(JSON.stringify(editor.value || {}))
  saveState.value = {
    ...saveState.value,
    mode: 'saving',
    label: 'Saving...',
    message: '',
  }
  try {
    const saved = await courseStore.saveEditor()
    lastSavedHash.value = JSON.stringify(saved || {})
    autosaveErrorShown.value = false
    saveState.value = {
      ...saveState.value,
      mode: 'ok',
      label: 'Saved',
      message: '',
      lastManualAt: new Date().toISOString(),
    }
    pushManagedToast({
      type: 'success',
      title: 'Course Saved',
      message: `${saved.title || saved.id} berhasil disimpan.`,
    })
  } catch (error) {
    showCourseActionError('Save Failed', error, 'Periksa data course.')
  }
}

const duplicateSelected = async () => {
  if (!canDuplicateCourse.value) return
  if (!editor.value.id) return
  const duplicated = await courseStore.duplicateCourse(editor.value.id)
  if (!duplicated) return
  courseStore.editCourse(duplicated.id)
  pushManagedToast({
    type: 'success',
    title: 'Course Duplicated',
    message: `${duplicated.title} siap diedit.`,
  })
}

const removeCurrentCourse = async () => {
  if (!canDeleteCourse.value) return
  if (!editor.value.id) return
  const ok = window.confirm('Hapus course ini? Kamu bisa undo dari toast setelah menghapus.')
  if (!ok) return
  const snapshot = JSON.parse(JSON.stringify(editor.value))
  const title = editor.value.title || editor.value.id
  await courseStore.deleteCourse(editor.value.id)
  pushManagedToast({
    type: 'success',
    title: 'Course Deleted',
    message: `${title} dihapus dari daftar.`,
    actionLabel: 'Undo',
    onAction: async () => {
      await courseStore.restoreCourse(snapshot)
      courseStore.editCourse(snapshot.id)
      pushManagedToast({
        type: 'info',
        title: 'Course Restored',
        message: `${title} berhasil dikembalikan.`,
      })
    },
  })
}

const publishNow = async () => {
  if (!canPublishCourse.value) return
  if (editor.value.settings?.approvalRequired && editor.value.settings?.approvalStatus !== 'approved') {
    pushManagedToast({
      type: 'error',
      title: 'Approval Required',
      message: 'Course harus approved sebelum publish.',
    })
    return
  }
  if (!canPublish.value) {
    pushManagedToast({
      type: 'error',
      title: 'Checklist belum lengkap',
      message: 'Lengkapi checklist sebelum publish.',
    })
    return
  }
  try {
    await courseStore.persistEditorStatus('published')
    lastSavedHash.value = JSON.stringify(editor.value || {})
    pushManagedToast({
      type: 'success',
      title: 'Course Published',
      message: 'Course berhasil dipublish.',
    })
  } catch (error) {
    showCourseActionError('Publish Failed', error)
  }
}

const setDraft = async () => {
  if (!canEditCourse.value) return
  try {
    await courseStore.persistEditorStatus('draft')
    lastSavedHash.value = JSON.stringify(editor.value || {})
    pushManagedToast({
      type: 'info',
      title: 'Status Updated',
      message: 'Status course menjadi draft.',
    }, {
      action: 'status-set-draft',
      operation: 'Set Draft',
    })
  } catch (error) {
    showCourseActionError('Status Update Failed', error)
  }
}

const archiveEditor = async () => {
  if (!canEditCourse.value) return
  if (!editor.value.id) return
  const ok = window.confirm('Archive course ini? Status bisa di-undo dari toast.')
  if (!ok) return
  const previousStatus = editor.value.status
  try {
    await courseStore.persistEditorStatus('archived')
    lastSavedHash.value = JSON.stringify(editor.value || {})
    pushManagedToast({
      type: 'info',
      title: 'Course Archived',
      message: `${editor.value.title || editor.value.id} dipindah ke archived.`,
      actionLabel: 'Undo',
      onAction: async () => {
        await courseStore.persistEditorStatus(previousStatus || 'draft')
        lastSavedHash.value = JSON.stringify(editor.value || {})
        pushManagedToast({
          type: 'info',
          title: 'Archive Reverted',
          message: 'Status course dikembalikan.',
        })
      },
    })
  } catch (error) {
    showCourseActionError('Archive Failed', error)
  }
}

const saveSchedule = async () => {
  if (!canScheduleCourse.value) return
  courseStore.scheduleEditor(scheduleForm.value)
  try {
    if (editor.value.id) {
      const saved = await courseStore.saveEditor()
      lastSavedHash.value = JSON.stringify(saved || {})
    }
    pushManagedToast({
      type: 'info',
      title: 'Schedule Updated',
      message: 'Jadwal publish course berhasil diperbarui.',
    })
  } catch (error) {
    showCourseActionError('Schedule Failed', error)
  }
}

const clearSchedule = async () => {
  if (!canScheduleCourse.value) return
  scheduleForm.value = { publishAt: '', unpublishAt: '' }
  courseStore.scheduleEditor(scheduleForm.value)
  try {
    if (editor.value.id) {
      const saved = await courseStore.saveEditor()
      lastSavedHash.value = JSON.stringify(saved || {})
    }
    pushManagedToast({
      type: 'info',
      title: 'Schedule Cleared',
      message: 'Jadwal publish berhasil dibersihkan.',
    }, {
      action: 'schedule-cleared',
      operation: 'Clear Schedule',
    })
  } catch (error) {
    showCourseActionError('Schedule Clear Failed', error)
  }
}

const quickToggleStatus = async (course) => {
  if (!canPublishCourse.value) return
  if (editor.value.id !== course.id) {
    courseStore.editCourse(course.id)
    pushManagedToast({
      type: 'info',
      title: 'Course Selected',
      message: 'Course dibuka di editor. Klik lagi untuk publish/unpublish.',
    })
    return
  }

  if (course.status === 'published') {
    const ok = window.confirm('Unpublish course ini?')
    if (!ok) return
    try {
      await courseStore.persistEditorStatus('draft')
      lastSavedHash.value = JSON.stringify(editor.value || {})
      pushManagedToast({
        type: 'info',
        title: 'Course Unpublished',
        message: 'Status course menjadi draft.',
      })
    } catch (error) {
      showCourseActionError('Status Update Failed', error)
    }
    return
  }

  if (!canPublish.value) {
    pushManagedToast({
      type: 'error',
      title: 'Checklist belum lengkap',
      message: 'Lengkapi checklist sebelum publish.',
    })
    return
  }
  if (editor.value.settings?.approvalRequired && editor.value.settings?.approvalStatus !== 'approved') {
    pushManagedToast({
      type: 'error',
      title: 'Approval Required',
      message: 'Course harus approved sebelum publish.',
    })
    return
  }

  try {
    await courseStore.persistEditorStatus('published')
    lastSavedHash.value = JSON.stringify(editor.value || {})
    pushManagedToast({
      type: 'success',
      title: 'Course Published',
      message: 'Course berhasil dipublish.',
    })
  } catch (error) {
    showCourseActionError('Publish Failed', error)
  }
}

const onModuleDragStart = (moduleIndex) => {
  if (!canEditCourse.value) return
  draggingModuleIndex.value = moduleIndex
}

const onModuleDrop = (moduleIndex) => {
  if (!canEditCourse.value) return
  if (draggingModuleIndex.value === null) return
  courseStore.reorderModule(draggingModuleIndex.value, moduleIndex)
  draggingModuleIndex.value = null
}

const onModuleDragEnd = () => {
  draggingModuleIndex.value = null
}

const onLessonDragStart = (moduleIndex, lessonIndex) => {
  if (!canEditCourse.value) return
  draggingLesson.value = { moduleIndex, lessonIndex }
}

const onLessonDrop = (moduleIndex, lessonIndex) => {
  if (!canEditCourse.value) return
  if (!draggingLesson.value) return
  if (draggingLesson.value.moduleIndex !== moduleIndex) {
    draggingLesson.value = null
    return
  }
  courseStore.reorderLesson(moduleIndex, draggingLesson.value.lessonIndex, lessonIndex)
  draggingLesson.value = null
}

const onLessonDragEnd = () => {
  draggingLesson.value = null
}

const toggleSelected = (courseId) => {
  selectedIds.value = selectedIds.value.includes(courseId)
    ? selectedIds.value.filter((id) => id !== courseId)
    : [...selectedIds.value, courseId]
}

const toggleSelectPage = () => {
  if (isPageSelected.value) {
    const pageIds = new Set(paginatedCourses.value.map((course) => course.id))
    selectedIds.value = selectedIds.value.filter((id) => !pageIds.has(id))
    return
  }
  const merged = new Set([...selectedIds.value, ...paginatedCourses.value.map((course) => course.id)])
  selectedIds.value = [...merged]
}

const runBulkStatus = async (status) => {
  if (!canBulkCourse.value || !selectedIds.value.length) return
  if (status === 'published' && !canPublishCourse.value) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  const targetIds = [...selectedIds.value]
  operationState.value = {
    active: true,
    title: 'Bulk Status Update',
    message: `Updating ${count} course to ${status}...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const result = await courseStore.bulkSetStatus(targetIds, status, {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    pushManagedToast({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Update Partially Completed' : 'Bulk Status Updated',
      message: `${result.processed}/${result.total} course diproses ke status ${status}.`,
    })
    addBulkJobHistory({
      type: 'bulk-status',
      status: result.cancelled ? 'partial' : 'completed',
      ids: targetIds,
      processed: result.processed,
      total: result.total,
      statusValue: status,
    })
    selectedIds.value = []
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const runBulkDelete = async () => {
  if (!canDeleteCourse.value || !selectedIds.value.length) return
  if (!window.confirm(`Hapus ${selectedIds.value.length} course terpilih?`)) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  const targetIds = [...selectedIds.value]
  operationState.value = {
    active: true,
    title: 'Bulk Delete',
    message: `Deleting ${count} course...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const snapshot = courseStore.exportCourses(targetIds)
    const result = await courseStore.bulkDelete(targetIds, {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    const deletedCount = result.deletedIds.length
    selectedIds.value = []
    pushManagedToast({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Delete Partially Completed' : 'Bulk Delete',
      message: `${deletedCount}/${result.total} course dihapus.`,
      actionLabel: 'Undo',
      onAction: async () => {
        await courseStore.importCourses(snapshot)
        pushManagedToast({
          type: 'info',
          title: 'Bulk Restored',
          message: `${deletedCount} course berhasil dikembalikan.`,
        })
      },
    })
    addBulkJobHistory({
      type: 'bulk-delete',
      status: result.cancelled ? 'partial' : 'completed',
      ids: targetIds,
      processed: result.processed,
      total: result.total,
    })
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const runBulkAutoPrerequisite = async () => {
  if (!canBulkCourse.value || !selectedIds.value.length) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  const targetIds = [...selectedIds.value]
  operationState.value = {
    active: true,
    title: 'Bulk Auto Prerequisite',
    message: `Generating prerequisite path for ${count} course...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const result = await courseStore.bulkAutoSuggestPrerequisites(targetIds, {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    pushManagedToast({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Auto Prerequisite Partially Completed' : 'Bulk Auto Prerequisite Completed',
      message: `${result.processed}/${result.total} course berhasil diproses.`,
    })
    addBulkJobHistory({
      type: 'bulk-auto-prerequisite',
      status: result.cancelled ? 'partial' : 'completed',
      ids: targetIds,
      processed: result.processed,
      total: result.total,
    })
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const runBulkClearPrerequisite = async () => {
  if (!canBulkCourse.value || !selectedIds.value.length) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  const targetIds = [...selectedIds.value]
  operationState.value = {
    active: true,
    title: 'Bulk Clear Prerequisite',
    message: `Removing prerequisites from ${count} course...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const result = await courseStore.bulkSetPrerequisites(targetIds, [], 'replace', {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    pushManagedToast({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Clear Prerequisite Partially Completed' : 'Bulk Clear Prerequisite Completed',
      message: `${result.processed}/${result.total} course berhasil diproses.`,
    })
    addBulkJobHistory({
      type: 'bulk-clear-prerequisite',
      status: result.cancelled ? 'partial' : 'completed',
      ids: targetIds,
      processed: result.processed,
      total: result.total,
    })
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const exportSelectedJson = () => {
  if (!canImportExportCourse.value) return
  const exported = courseStore.exportCourses(selectedIds.value)
  downloadJson(`courses-selected-${new Date().toISOString().slice(0, 10)}.json`, exported)
  pushManagedToast({
    type: 'info',
    title: 'Export Selected',
    message: `${exported.length} course diexport ke JSON.`,
  }, {
    action: 'export-selected-json',
    operation: 'Export Selected',
    meta: { count: exported.length },
  })
}

const exportAllJson = () => {
  if (!canImportExportCourse.value) return
  const exported = courseStore.exportCourses()
  downloadJson(`courses-all-${new Date().toISOString().slice(0, 10)}.json`, exported)
  pushManagedToast({
    type: 'info',
    title: 'Export All',
    message: `${exported.length} course diexport ke JSON.`,
  }, {
    action: 'export-all-json',
    operation: 'Export All',
    meta: { count: exported.length },
  })
}

const triggerImport = () => {
  if (!canImportExportCourse.value) return
  importInputRef.value?.click()
}

const handleImportFile = async (event) => {
  const file = event.target?.files?.[0]
  if (!file) return
  if (!canImportExportCourse.value) return
  isImporting.value = true
  importReport.value = null
  operationState.value = {
    active: true,
    title: 'Importing Courses',
    message: `Processing file: ${file.name}`,
    processed: 0,
    total: 0,
    cancelRequested: false,
  }
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const payload = Array.isArray(parsed) ? parsed : [parsed]
    operationState.value.total = payload.length
    const result = await courseStore.importCourses(payload, {
      dryRun: importOptions.value.dryRun,
      atomic: importOptions.value.atomic,
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    importReport.value = result
    pushManagedToast({
      type: result.errorCount > 0 || result.cancelled ? 'info' : 'success',
      title: importOptions.value.dryRun ? 'Dry Run Complete' : result.cancelled ? 'Import Stopped' : 'Import Complete',
      message: `${result.importedCount}/${result.total} processed (${result.createdCount} created, ${result.updatedCount} updated, ${result.errorCount} error).`,
    })
  } catch (error) {
    pushManagedToast({
      type: 'error',
      title: 'Import Failed',
      message: error?.message || 'File JSON tidak valid.',
    })
  } finally {
    operationState.value.active = false
    isImporting.value = false
    if (event.target) event.target.value = ''
  }
}

const triggerThumbnailUpload = () => {
  thumbnailInputRef.value?.click()
}

const extractLocalUploadId = (value) => {
  const text = String(value || '').trim()
  const match = text.match(/^local:\/\/upload\/(.+)$/i)
  return match?.[1] || ''
}

const resolveThumbnailPreview = async () => {
  const thumb = String(editor.value.thumbnail || '').trim()
  if (!thumb) {
    thumbnailPreviewSrc.value = ''
    return
  }
  if (thumb.startsWith('data:image/')) {
    thumbnailPreviewSrc.value = thumb
    return
  }
  const localUploadId = extractLocalUploadId(thumb) || String(editor.value.thumbnailUploadId || '').trim()
  if (localUploadId && apiClient.courses?.getAttachmentData) {
    try {
      const payload = await apiClient.courses.getAttachmentData(localUploadId)
      thumbnailPreviewSrc.value = String(payload?.dataUrl || '')
      return
    } catch {
      thumbnailPreviewSrc.value = ''
      return
    }
  }
  thumbnailPreviewSrc.value = thumb
}

const clearThumbnail = () => {
  editor.value.thumbnail = ''
  editor.value.thumbnailUploadId = ''
  thumbnailPreviewSrc.value = ''
  if (thumbnailInputRef.value) thumbnailInputRef.value.value = ''
}

const handleThumbnailFileChange = async (event) => {
  const file = event.target?.files?.[0]
  if (!file) return
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
  if (!allowed.includes(String(file.type || '').toLowerCase())) {
    pushManagedToast({
      type: 'error',
      title: 'Format tidak didukung',
      message: 'Gunakan PNG, JPG, WEBP, atau GIF.',
    })
    if (event.target) event.target.value = ''
    return
  }
  const maxBytes = 5 * 1024 * 1024
  if (Number(file.size || 0) > maxBytes) {
    pushManagedToast({
      type: 'error',
      title: 'File terlalu besar',
      message: 'Ukuran maksimal thumbnail 5MB.',
    })
    if (event.target) event.target.value = ''
    return
  }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'))
      reader.readAsDataURL(file)
    })
    if (apiClient.uploads?.create) {
      const uploaded = await apiClient.uploads.create({
        fileName: file.name || 'thumbnail',
        dataUrl: String(dataUrl || ''),
        purpose: 'course-thumbnail',
      })
      editor.value.thumbnailUploadId = String(uploaded?.id || '')
      editor.value.thumbnail = String(uploaded?.url || '')
      thumbnailPreviewSrc.value = String(dataUrl || '')
    } else {
      editor.value.thumbnailUploadId = ''
      editor.value.thumbnail = String(dataUrl || '')
      thumbnailPreviewSrc.value = String(dataUrl || '')
    }
    pushManagedToast({
      type: 'success',
      title: 'Thumbnail updated',
      message: `${file.name} berhasil dipakai sebagai thumbnail.`,
    })
  } catch (error) {
    pushManagedToast({
      type: 'error',
      title: 'Upload gagal',
      message: error?.message || 'Gagal memproses gambar.',
    })
  } finally {
    if (event.target) event.target.value = ''
  }
}

const setArticleFileInputRef = (moduleIndex, lessonIndex, element) => {
  const key = `${moduleIndex}-${lessonIndex}`
  if (!element) {
    delete articleFileInputRefs.value[key]
    return
  }
  articleFileInputRefs.value[key] = element
}

const triggerArticleUpload = (moduleIndex, lessonIndex) => {
  const key = `${moduleIndex}-${lessonIndex}`
  articleFileInputRefs.value[key]?.click()
}

const clearArticleAttachment = (lesson, moduleIndex, lessonIndex) => {
  if (!lesson) return
  lesson.articleAttachmentId = ''
  lesson.articleAttachmentUrl = ''
  lesson.articleAttachmentName = ''
  const key = `${moduleIndex}-${lessonIndex}`
  if (articleFileInputRefs.value[key]) {
    articleFileInputRefs.value[key].value = ''
  }
}

const onArticleFileChange = async (event, lesson) => {
  const file = event.target?.files?.[0]
  if (!file || !lesson) return
  const maxBytes = 8 * 1024 * 1024
  if (Number(file.size || 0) > maxBytes) {
    pushManagedToast({
      type: 'error',
      title: 'File terlalu besar',
      message: 'Ukuran maksimal file artikel 8MB.',
    })
    if (event.target) event.target.value = ''
    return
  }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Gagal membaca file artikel.'))
      reader.readAsDataURL(file)
    })
    if (apiClient.uploads?.create) {
      const uploaded = await apiClient.uploads.create({
        fileName: file.name || 'article-attachment',
        dataUrl: String(dataUrl || ''),
        purpose: 'lesson-article',
      })
      lesson.articleAttachmentId = String(uploaded?.id || '')
      lesson.articleAttachmentUrl = String(uploaded?.url || '')
    } else {
      lesson.articleAttachmentId = ''
      lesson.articleAttachmentUrl = ''
    }
    lesson.articleAttachmentName = String(file.name || 'article-attachment')
    pushManagedToast({
      type: 'success',
      title: 'Article uploaded',
      message: `${file.name} berhasil ditautkan ke lesson article.`,
    })
  } catch (error) {
    pushManagedToast({
      type: 'error',
      title: 'Upload gagal',
      message: error?.message || 'Gagal memproses file artikel.',
    })
  } finally {
    if (event.target) event.target.value = ''
  }
}

const openLinkedQuiz = (lesson) => {
  const quizId = String(lesson?.quizId || '').trim()
  if (!quizId) {
    pushManagedToast({
      type: 'info',
      title: 'Quiz belum dipilih',
      message: 'Pilih Quiz ID dulu sebelum membuka Quiz View.',
    })
    return
  }
  router.push({
    name: 'quiz',
    params: { id: quizId },
    query: {
      course: String(editor.value.id || ''),
      source: 'lesson-quiz',
    },
  })
}

const openQuizManagement = () => {
  router.push({ name: 'quiz-admin' })
}

const formatBytesCompact = (value) => {
  const bytes = Math.max(0, Number(value || 0))
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes)} B`
}

const runStorageCleanup = async () => {
  if (!apiClient.courseManagement?.cleanupStorage || isStorageCleanupRunning.value) return
  isStorageCleanupRunning.value = true
  try {
    const result = await apiClient.courseManagement.cleanupStorage()
    pushManagedToast({
      type: 'success',
      title: 'Storage cleanup selesai',
      message: `${result?.prunedInlineDataUrlCount || 0} inline blob dibersihkan, ${result?.removedUploads || 0} upload orphan dihapus, reclaim ${formatBytesCompact(result?.reclaimedCourseBytes || 0)}.`,
    })
    courseStore.loaded = false
    await courseStore.load()
  } catch (error) {
    pushManagedToast({
      type: 'error',
      title: 'Cleanup gagal',
      message: error?.message || 'Tidak bisa membersihkan storage.',
    })
  } finally {
    isStorageCleanupRunning.value = false
  }
}

const requestCancelOperation = () => {
  operationState.value.cancelRequested = true
  announceA11y('Permintaan cancel sedang diproses.')
  trackCourseEvent(
    'operation-cancel-requested',
    {
      operation: operationState.value.title || 'Operation',
      message: 'User requested cancel',
      meta: {
        processed: operationState.value.processed,
        total: operationState.value.total,
      },
    },
    'warning',
  )
}

const syncLessonPrimaryUrl = (lesson) => {
  if (!lesson || typeof lesson !== 'object') return
  const type = String(lesson.type || 'video')
  if (type === 'video') {
    lesson.contentUrl = String(lesson.videoUrl || '').trim()
    return
  }
  if (type === 'article') {
    lesson.contentUrl = String(lesson.articleReferenceUrl || '').trim()
    return
  }
  if (type === 'assignment') {
    lesson.contentUrl = String(lesson.assignmentResourceUrl || '').trim()
    return
  }
  if (type === 'live') {
    lesson.contentUrl = String(lesson.liveMeetingUrl || '').trim()
    return
  }
  if (type === 'quiz') {
    lesson.contentUrl = ''
  }
}

const onLessonTypeChange = (lesson) => {
  if (!lesson || typeof lesson !== 'object') return
  if (lesson.type === 'quiz') {
    lesson.quizPassingScore = Number.isFinite(Number(lesson.quizPassingScore)) ? Number(lesson.quizPassingScore) : 70
    lesson.quizTimerMin = Number.isFinite(Number(lesson.quizTimerMin)) ? Number(lesson.quizTimerMin) : 0
  }
  if (lesson.type === 'live' && !String(lesson.liveTimezone || '').trim()) {
    lesson.liveTimezone = 'Asia/Jakarta'
  }
  syncLessonPrimaryUrl(lesson)
}

const addAsset = () => {
  if (!canEditCourse.value) return
  if (!assetDraft.value.name.trim() || !assetDraft.value.url.trim()) {
    pushManagedToast({
      type: 'error',
      title: 'Asset Invalid',
      message: 'Asset name dan URL wajib diisi.',
    })
    return
  }
  courseStore.addEditorAsset(assetDraft.value)
  assetDraft.value = { name: '', type: 'file', url: '' }
}

const removeAsset = (assetId) => {
  if (!canEditCourse.value) return
  courseStore.removeEditorAsset(assetId)
}

const bumpAssetVersion = (assetId) => {
  if (!canEditCourse.value) return
  const note = window.prompt('Version note (optional):', 'Update content')
  courseStore.bumpEditorAssetVersion(assetId, { note: note || 'Update content' })
}

const formatDateTime = (value) => {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

const queueAutosave = () => {
  if (autosaveTimerId.value) {
    window.clearTimeout(autosaveTimerId.value)
  }
  autosaveTimerId.value = window.setTimeout(async () => {
    if (!hasUnsavedChanges.value || courseStore.isSaving) return
    const hasMeaningfulInput = Boolean(
      String(editor.value.title || '').trim() ||
        String(editor.value.description || '').trim() ||
        (editor.value.modules || []).some(
          (module) =>
            String(module.title || '').trim() ||
            (module.lessons || []).some((lesson) => String(lesson.title || '').trim()),
        ),
    )
    if (!hasMeaningfulInput) return
    try {
      pendingConflictDraft.value = JSON.parse(JSON.stringify(editor.value || {}))
      saveState.value = {
        ...saveState.value,
        mode: 'saving',
        label: 'Autosaving...',
      }
      const saved = await courseStore.saveDraftEditor()
      lastSavedHash.value = JSON.stringify(saved || {})
      autosaveErrorShown.value = false
      saveState.value = {
        ...saveState.value,
        mode: 'ok',
        label: 'Autosaved',
        message: '',
        lastAutoAt: new Date().toISOString(),
      }
    } catch (error) {
      if (!autosaveErrorShown.value) {
        autosaveErrorShown.value = true
        pushManagedToast({
          type: 'error',
          title: 'Autosave gagal',
          message: error?.message || 'Silakan simpan manual.',
        })
      }
      showCourseActionError('Autosave Failed', error, 'Silakan simpan manual.')
    }
  }, 1200)
}

const onBeforeUnload = (event) => {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

watch([statusFilter, searchKeyword, sortKey, sortDir, pageSize], () => {
  page.value = 1
})

watch(totalPages, (next) => {
  if (page.value > next) {
    page.value = next
  }
})

watch(
  () => paginatedCourses.value.map((course) => course.id).join(','),
  () => {
    const validIds = new Set(filteredCourses.value.map((course) => course.id))
    selectedIds.value = selectedIds.value.filter((id) => validIds.has(id))
  },
)

watch(
  () => editor.value.title,
  (title) => {
    const nextSlug = toSlug(title)
    if (editor.value.slug !== nextSlug) {
      editor.value.slug = nextSlug
    }
  },
  { immediate: true },
)

watch(
  () => editor.value.id,
  () => {
    focusedDependencyNodeId.value = ''
    dependencyNodeQuery.value = ''
    scheduleForm.value = {
      publishAt: editor.value.publishAt || '',
      unpublishAt: editor.value.unpublishAt || '',
    }
    lastSavedHash.value = JSON.stringify(editor.value || {})
    autosaveErrorShown.value = false
    activeLocale.value = localeOptions.value[0] || 'id'
    basicWizardStep.value = 1
    const localized = editor.value.settings?.localizedContent?.[activeLocale.value] || {}
    localizedDraft.value = {
      title: String(localized?.title || editor.value.title || ''),
      description: String(localized?.description || editor.value.description || ''),
    }
    revisionDiffBaseId.value = '__current__'
    revisionDiffTargetId.value = revisions.value[0]?.id || '__current__'
    resolveThumbnailPreview().catch(() => {})
  },
  { immediate: true },
)

watch(
  () => [editor.value.thumbnail, editor.value.thumbnailUploadId],
  ([thumbnail]) => {
    const thumb = String(thumbnail || '').trim()
    if (!extractLocalUploadId(thumb) && !thumb.startsWith('data:') && editor.value.thumbnailUploadId) {
      editor.value.thumbnailUploadId = ''
    }
    resolveThumbnailPreview().catch(() => {})
  },
  { immediate: true },
)

watch(
  () => activeLocale.value,
  (locale) => {
    const normalizedLocale = String(locale || '').toLowerCase() || 'id'
    if (!localeOptions.value.includes(normalizedLocale)) {
      activeLocale.value = localeOptions.value[0] || 'id'
      return
    }
    const localized = editor.value.settings?.localizedContent?.[normalizedLocale] || {}
    localizedDraft.value = {
      title: String(localized?.title || ''),
      description: String(localized?.description || ''),
    }
  },
  { immediate: true },
)

watch(
  () => revisions.value.map((item) => item.id).join(','),
  () => {
    const options = new Set(revisionDiffOptions.value.map((item) => item.id))
    if (!options.has(revisionDiffBaseId.value)) {
      revisionDiffBaseId.value = '__current__'
    }
    if (!options.has(revisionDiffTargetId.value)) {
      revisionDiffTargetId.value = revisions.value[0]?.id || '__current__'
    }
  },
  { immediate: true },
)

watch(telemetryLimit, () => {
  refreshTelemetry().catch(() => {})
})

watch(
  () => telemetryAutoRefresh.value,
  (enabled) => {
    if (telemetryRefreshTimerId.value) {
      window.clearInterval(telemetryRefreshTimerId.value)
      telemetryRefreshTimerId.value = null
    }
    if (!enabled) return
    telemetryRefreshTimerId.value = window.setInterval(() => {
      refreshTelemetry().catch(() => {})
    }, 15000)
  },
  { immediate: true },
)

watch(
  () => bulkQueue.value,
  () => {
    saveBulkQueue()
  },
  { deep: true },
)

watch(
  () => bulkQueueAutoRun.value,
  (enabled) => {
    if (bulkQueueTimerId.value) {
      window.clearInterval(bulkQueueTimerId.value)
      bulkQueueTimerId.value = null
    }
    if (!enabled) return
    bulkQueueTimerId.value = window.setInterval(() => {
      processBulkQueueNow().catch(() => {})
    }, 2000)
  },
  { immediate: true },
)

watch(
  () => editorHash.value,
  () => {
    queueAutosave()
  },
)

watch(
  () => showAdvancedInputs.value,
  (enabled) => {
    if (!enabled) {
      basicWizardStep.value = 1
    }
    try {
      window.localStorage.setItem(ADVANCED_INPUT_TOGGLE_KEY, enabled ? '1' : '0')
    } catch {
      // ignore persistence errors
    }
  },
)

watch(
  () => dependencyViewMode.value,
  () => {
    if (!focusedDependencyNodeId.value) return
    const visibleIds = new Set(dependencyGraph.value.nodes.map((node) => node.courseId).filter(Boolean))
    if (!visibleIds.has(focusedDependencyNodeId.value)) {
      focusedDependencyNodeId.value = ''
    }
  },
)

onBeforeRouteLeave((_to, _from, next) => {
  if (!hasUnsavedChanges.value) {
    next()
    return
  }
  if (window.confirm('Perubahan belum disimpan. Tetap keluar dari halaman ini?')) {
    next()
    return
  }
  next(false)
})

onMounted(async () => {
  try {
    const saved = window.localStorage.getItem('cm_dependency_view_mode')
    if (saved) setDependencyViewMode(saved)
    const savedAdvanced = window.localStorage.getItem(ADVANCED_INPUT_TOGGLE_KEY)
    if (savedAdvanced === '0') showAdvancedInputs.value = false
    if (savedAdvanced === '1') showAdvancedInputs.value = true
  } catch {
    // ignore
  }
  try {
    if (apiClient.courseManagement?.cleanupStorage) {
      const cleanupResult = await apiClient.courseManagement.cleanupStorage()
      if ((cleanupResult?.prunedInlineDataUrlCount || 0) > 0 || (cleanupResult?.removedUploads || 0) > 0) {
        pushManagedToast({
          type: 'info',
          title: 'Storage optimized',
          message: `${cleanupResult.prunedInlineDataUrlCount} data inline lama dibersihkan. Reclaim ${formatBytesCompact(cleanupResult.reclaimedCourseBytes || 0)}.`,
        })
      }
    }
    await Promise.all([courseStore.load(), profileStore.load()])
    if (apiClient.quiz?.list) {
      try {
        quizCatalogOptions.value = await apiClient.quiz.list()
      } catch {
        quizCatalogOptions.value = []
      }
    }
    if (String(profile.value?.accessRole || '') === 'admin') {
      courseStore.loadPermissionMatrix().catch(() => {})
    }
    refreshTelemetry().catch(() => {})
    refreshImmutableAudit().catch(() => {})
    loadNotificationIntegration().catch(() => {})
    if (apiClient.courseManagement?.listJobs) {
      refreshQueueState().catch(() => {
        loadBulkQueue()
      })
    } else {
      loadBulkQueue()
    }
    processBulkQueueNow().catch(() => {})
  } catch (error) {
    pushManagedToast({
      type: 'error',
      title: 'Access Denied',
      message: error?.message || 'Kamu tidak punya izin untuk membuka Course Management.',
    })
  }
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  if (autosaveTimerId.value) {
    window.clearTimeout(autosaveTimerId.value)
  }
  if (a11yTimerId.value) {
    window.clearTimeout(a11yTimerId.value)
  }
  if (telemetryRefreshTimerId.value) {
    window.clearInterval(telemetryRefreshTimerId.value)
  }
  if (bulkQueueTimerId.value) {
    window.clearInterval(bulkQueueTimerId.value)
  }
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
