<template>
  <section class="quiz-admin-layout course-mgmt-layout">
    <article class="card quiz-admin-list course-mgmt-list">
      <div class="section-header">
        <h2>Course Management</h2>
        <div class="table-actions">
          <button class="ghost-btn" type="button" @click="triggerImport" :disabled="!canEditCourse || isImporting">
            {{ isImporting ? 'Importing...' : 'Import JSON' }}
          </button>
          <button class="ghost-btn" type="button" @click="exportAllJson">Export All</button>
          <button class="ghost-btn" type="button" @click="duplicateSelected" :disabled="!editor.id || !canEditCourse">Duplicate</button>
          <button class="primary-btn" type="button" @click="createNewCourse" :disabled="!canEditCourse">New Course</button>
        </div>
      </div>
      <p class="muted">Kelola lifecycle course: draft, curriculum, workflow publish, dan schedule.</p>
      <input ref="importInputRef" class="hidden-input" type="file" accept="application/json,.json" @change="handleImportFile" />

      <div class="quiz-admin-filter-row course-mgmt-filter-row">
        <input v-model="searchKeyword" class="quiz-input" type="search" placeholder="Search title/id/slug/category..." />
        <select v-model="statusFilter" class="quiz-input">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select v-model="sortKey" class="quiz-input">
          <option value="updatedAt">Sort: Updated</option>
          <option value="title">Sort: Title</option>
          <option value="status">Sort: Status</option>
          <option value="lessonCount">Sort: Lessons</option>
        </select>
        <select v-model="sortDir" class="quiz-input">
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
            <input type="checkbox" :checked="selectedIds.includes(course.id)" @change="toggleSelected(course.id)" />
          </label>
          <button type="button" class="quiz-admin-select" @click="openEditor(course.id)">
            <strong>{{ course.title }}</strong>
            <span>{{ course.id }} · {{ course.slug }}</span>
            <span class="muted">
              {{ course.moduleCount }} modules · {{ course.lessonCount }} lessons · {{ course.durationTotal }}m · {{ course.assetCount }} assets ·
              {{ course.prerequisiteCount || 0 }} prereq
            </span>
            <span class="pill">{{ course.category }} · {{ course.level }}</span>
          </button>
          <div class="quiz-admin-item-actions">
            <span class="status-pill" :class="statusClass(course.status)">{{ course.status }}</span>
            <button class="ghost-btn" type="button" :disabled="!canEditCourse" @click="quickToggleStatus(course)">
              {{ course.status === 'published' ? 'Unpublish' : 'Publish' }}
            </button>
          </div>
        </article>
      </div>

      <div v-if="selectedIds.length" class="bulk-row">
        <span>{{ selectedIds.length }} course terpilih</span>
        <div class="table-actions">
          <button class="ghost-btn" type="button" :disabled="!canEditCourse || isBulkBusy" @click="runBulkStatus('published')">Publish</button>
          <button class="ghost-btn" type="button" :disabled="!canEditCourse || isBulkBusy" @click="runBulkStatus('draft')">Draft</button>
          <button class="ghost-btn" type="button" :disabled="!canEditCourse || isBulkBusy" @click="runBulkStatus('archived')">Archive</button>
          <button class="ghost-btn" type="button" :disabled="!canEditCourse || isBulkBusy" @click="runBulkAutoPrerequisite">Auto Prereq</button>
          <button class="ghost-btn" type="button" :disabled="!canEditCourse || isBulkBusy" @click="runBulkClearPrerequisite">Clear Prereq</button>
          <button class="ghost-btn" type="button" @click="exportSelectedJson">Export Selected</button>
          <button class="ghost-btn danger-btn" type="button" :disabled="!canEditCourse || isBulkBusy" @click="runBulkDelete">Delete Selected</button>
        </div>
      </div>

      <p v-if="!filteredCourses.length && !isLoading" class="muted">Belum ada course.</p>
      <div v-if="filteredCourses.length" class="pager-row course-mgmt-pager">
        <span>Page {{ page }} / {{ totalPages }}</span>
        <div class="table-actions">
          <label class="quiz-select-page">
            <input type="checkbox" :checked="isPageSelected" @change="toggleSelectPage" />
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
          <button class="ghost-btn" type="button" @click="isPreviewMode = !isPreviewMode">
            {{ isPreviewMode ? 'Back to Edit' : 'Student Preview' }}
          </button>
          <button class="ghost-btn" type="button" @click="setDraft" :disabled="editor.status === 'draft' || !canEditCourse">Set Draft</button>
          <button class="ghost-btn" type="button" @click="archiveEditor" :disabled="editor.status === 'archived' || !canEditCourse">Archive</button>
          <button class="ghost-btn danger-btn" type="button" @click="removeCurrentCourse" :disabled="!editor.id || !canEditCourse">Delete</button>
          <button class="primary-btn" type="button" :disabled="isSaving || !canEditCourse" @click="saveCourse">{{ isSaving ? 'Saving...' : 'Save Course' }}</button>
        </div>
      </div>

      <article v-if="validationMessages.length" class="quiz-admin-validation">
        <strong>Course belum memenuhi checklist publish</strong>
        <ul>
          <li v-for="message in validationMessages" :key="message">{{ message }}</li>
        </ul>
      </article>

      <template v-if="!isPreviewMode">
        <section class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>1. Course Info</h4>
            <span class="pill">{{ editor.status || 'draft' }}</span>
          </div>
          <form class="form-grid compact quiz-admin-form" @submit.prevent="saveCourse">
            <label class="quiz-input-group">
              <span class="quiz-input-label">Course ID</span>
              <input v-model="editor.id" class="quiz-input" type="text" placeholder="auto from slug if empty" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Slug</span>
              <input v-model="editor.slug" class="quiz-input" type="text" placeholder="ui-design-fundamentals" />
            </label>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Title</span>
              <input v-model="editor.title" class="quiz-input" type="text" required />
            </label>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Description</span>
              <textarea v-model="editor.description" class="quiz-input" rows="3" placeholder="Course description..."></textarea>
            </label>
            <label class="quiz-input-group full">
              <span class="quiz-input-label">Thumbnail URL</span>
              <input v-model="editor.thumbnail" class="quiz-input" type="url" placeholder="https://..." />
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
        </section>

        <section class="quiz-editor-section">
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
                    </label>
                    <label>
                      <span class="quiz-input-label">Type</span>
                      <select v-model="lesson.type" class="quiz-input">
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
                    </label>
                    <label class="full">
                      <span class="quiz-input-label">Content URL</span>
                      <input v-model="lesson.contentUrl" class="quiz-input" type="url" placeholder="https://..." />
                    </label>
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
        </section>

        <section class="quiz-editor-section">
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

        <section class="quiz-editor-section">
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
                    @click="onDependencyNodeClick(node, $event)"
                    @keydown.enter.prevent="onDependencyNodeClick(node)"
                    @keydown.space.prevent="onDependencyNodeClick(node)"
                  />
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
        </section>

        <section class="quiz-editor-section">
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
              <button class="primary-btn" type="button" :disabled="!canPublish || !canEditCourse" @click="publishNow">Publish Now</button>
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
              <button class="ghost-btn" type="button" @click="saveSchedule">Save Schedule</button>
              <button class="ghost-btn" type="button" @click="clearSchedule">Clear Schedule</button>
            </div>
            <p class="muted">Jadwal publish akan otomatis mengubah status sesuai waktu yang diset.</p>
          </article>
        </section>

        <section class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>6. Operational Audit</h4>
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
      <article class="modal-card cm-progress-modal">
        <h3>{{ operationState.title }}</h3>
        <p class="muted">{{ operationState.message }}</p>
        <div class="progress-row">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${operationProgressPercent}%` }"></div>
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
import { onBeforeRouteLeave } from 'vue-router'
import { useCourseManagementStore } from '../stores/courseManagement'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

const courseStore = useCourseManagementStore()
const profileStore = useProfileStore()
const toastStore = useToastStore()
const { courseSummaries, editor, isLoading, isSaving, auditLogs } = storeToRefs(courseStore)
const { profile } = storeToRefs(profileStore)

const searchKeyword = ref('')
const statusFilter = ref('all')
const sortKey = ref('updatedAt')
const sortDir = ref('desc')
const page = ref(1)
const pageSize = ref(10)
const isPreviewMode = ref(false)
const draggingModuleIndex = ref(null)
const draggingLesson = ref(null)
const autosaveTimerId = ref(null)
const autosaveErrorShown = ref(false)
const lastSavedHash = ref('')
const selectedIds = ref([])
const importInputRef = ref(null)
const focusedDependencyNodeId = ref('')
const dependencyNodeQuery = ref('')
const dependencyViewMode = ref('all')
const isImporting = ref(false)
const isBulkBusy = ref(false)
const importReport = ref(null)
const operationState = ref({
  active: false,
  title: '',
  message: '',
  processed: 0,
  total: 0,
  cancelRequested: false,
})
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

const totalPages = computed(() => Math.max(1, Math.ceil(filteredCourses.value.length / pageSize.value)))

const paginatedCourses = computed(() => {
  const safePage = Math.min(page.value, totalPages.value)
  const start = (safePage - 1) * pageSize.value
  return filteredCourses.value.slice(start, start + pageSize.value)
})

const checklist = computed(() => courseStore.getPublishChecklist(editor.value))
const canPublish = computed(() => checklist.value.every((item) => item.passed))
const validationMessages = computed(() => checklist.value.filter((item) => !item.passed).map((item) => item.label))
const editorHash = computed(() => JSON.stringify(editor.value || {}))
const hasUnsavedChanges = computed(() => editorHash.value !== lastSavedHash.value)
const canEditCourse = computed(() => ['admin', 'instructor'].includes(String(profile.value?.accessRole || '')))
const isPageSelected = computed(() => {
  if (!paginatedCourses.value.length) return false
  return paginatedCourses.value.every((course) => selectedIds.value.includes(course.id))
})
const recentAuditLogs = computed(() => auditLogs.value.slice(0, 12))
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

const totalLessons = computed(() => (editor.value.modules || []).reduce((sum, module) => sum + (module.lessons || []).length, 0))
const totalDuration = computed(() =>
  (editor.value.modules || []).reduce(
    (sum, module) => sum + (module.lessons || []).reduce((lessonSum, lesson) => lessonSum + Number(lesson.durationMin || 0), 0),
    0,
  ),
)

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
    toastStore.push({
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

const autoSuggestEditorPrerequisite = () => {
  if (!canEditCourse.value) return
  const suggested = courseStore.suggestEditorPrerequisites()
  toastStore.push({
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
  if (!canEditCourse.value) return
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

const saveCourse = async () => {
  if (!canEditCourse.value) return
  try {
    const saved = await courseStore.saveEditor()
    lastSavedHash.value = JSON.stringify(saved || {})
    autosaveErrorShown.value = false
    toastStore.push({
      type: 'success',
      title: 'Course Saved',
      message: `${saved.title || saved.id} berhasil disimpan.`,
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Save Failed',
      message: error?.messages?.[0] || error?.message || 'Periksa data course.',
    })
  }
}

const duplicateSelected = async () => {
  if (!canEditCourse.value) return
  if (!editor.value.id) return
  const duplicated = await courseStore.duplicateCourse(editor.value.id)
  if (!duplicated) return
  courseStore.editCourse(duplicated.id)
  toastStore.push({
    type: 'success',
    title: 'Course Duplicated',
    message: `${duplicated.title} siap diedit.`,
  })
}

const removeCurrentCourse = async () => {
  if (!canEditCourse.value) return
  if (!editor.value.id) return
  const ok = window.confirm('Hapus course ini? Kamu bisa undo dari toast setelah menghapus.')
  if (!ok) return
  const snapshot = JSON.parse(JSON.stringify(editor.value))
  const title = editor.value.title || editor.value.id
  await courseStore.deleteCourse(editor.value.id)
  toastStore.push({
    type: 'success',
    title: 'Course Deleted',
    message: `${title} dihapus dari daftar.`,
    actionLabel: 'Undo',
    onAction: async () => {
      await courseStore.restoreCourse(snapshot)
      courseStore.editCourse(snapshot.id)
      toastStore.push({
        type: 'info',
        title: 'Course Restored',
        message: `${title} berhasil dikembalikan.`,
      })
    },
  })
}

const publishNow = async () => {
  if (!canEditCourse.value) return
  if (!canPublish.value) {
    toastStore.push({
      type: 'error',
      title: 'Checklist belum lengkap',
      message: 'Lengkapi checklist sebelum publish.',
    })
    return
  }
  await courseStore.persistEditorStatus('published')
  lastSavedHash.value = JSON.stringify(editor.value || {})
  toastStore.push({
    type: 'success',
    title: 'Course Published',
    message: 'Course berhasil dipublish.',
  })
}

const setDraft = async () => {
  if (!canEditCourse.value) return
  await courseStore.persistEditorStatus('draft')
  lastSavedHash.value = JSON.stringify(editor.value || {})
}

const archiveEditor = async () => {
  if (!canEditCourse.value) return
  if (!editor.value.id) return
  const ok = window.confirm('Archive course ini? Status bisa di-undo dari toast.')
  if (!ok) return
  const previousStatus = editor.value.status
  await courseStore.persistEditorStatus('archived')
  lastSavedHash.value = JSON.stringify(editor.value || {})
  toastStore.push({
    type: 'info',
    title: 'Course Archived',
    message: `${editor.value.title || editor.value.id} dipindah ke archived.`,
    actionLabel: 'Undo',
    onAction: async () => {
      await courseStore.persistEditorStatus(previousStatus || 'draft')
      lastSavedHash.value = JSON.stringify(editor.value || {})
      toastStore.push({
        type: 'info',
        title: 'Archive Reverted',
        message: 'Status course dikembalikan.',
      })
    },
  })
}

const saveSchedule = async () => {
  if (!canEditCourse.value) return
  courseStore.scheduleEditor(scheduleForm.value)
  if (editor.value.id) {
    const saved = await courseStore.saveEditor()
    lastSavedHash.value = JSON.stringify(saved || {})
  }
  toastStore.push({
    type: 'info',
    title: 'Schedule Updated',
    message: 'Jadwal publish course berhasil diperbarui.',
  })
}

const clearSchedule = async () => {
  if (!canEditCourse.value) return
  scheduleForm.value = { publishAt: '', unpublishAt: '' }
  courseStore.scheduleEditor(scheduleForm.value)
  if (editor.value.id) {
    const saved = await courseStore.saveEditor()
    lastSavedHash.value = JSON.stringify(saved || {})
  }
}

const quickToggleStatus = async (course) => {
  if (!canEditCourse.value) return
  if (editor.value.id !== course.id) {
    courseStore.editCourse(course.id)
    toastStore.push({
      type: 'info',
      title: 'Course Selected',
      message: 'Course dibuka di editor. Klik lagi untuk publish/unpublish.',
    })
    return
  }

  if (course.status === 'published') {
    const ok = window.confirm('Unpublish course ini?')
    if (!ok) return
    await courseStore.persistEditorStatus('draft')
    lastSavedHash.value = JSON.stringify(editor.value || {})
    toastStore.push({
      type: 'info',
      title: 'Course Unpublished',
      message: 'Status course menjadi draft.',
    })
    return
  }

  if (!canPublish.value) {
    toastStore.push({
      type: 'error',
      title: 'Checklist belum lengkap',
      message: 'Lengkapi checklist sebelum publish.',
    })
    return
  }

  await courseStore.persistEditorStatus('published')
  lastSavedHash.value = JSON.stringify(editor.value || {})
  toastStore.push({
    type: 'success',
    title: 'Course Published',
    message: 'Course berhasil dipublish.',
  })
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
  if (!canEditCourse.value || !selectedIds.value.length) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  operationState.value = {
    active: true,
    title: 'Bulk Status Update',
    message: `Updating ${count} course to ${status}...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const result = await courseStore.bulkSetStatus(selectedIds.value, status, {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    toastStore.push({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Update Partially Completed' : 'Bulk Status Updated',
      message: `${result.processed}/${result.total} course diproses ke status ${status}.`,
    })
    selectedIds.value = []
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const runBulkDelete = async () => {
  if (!canEditCourse.value || !selectedIds.value.length) return
  if (!window.confirm(`Hapus ${selectedIds.value.length} course terpilih?`)) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  operationState.value = {
    active: true,
    title: 'Bulk Delete',
    message: `Deleting ${count} course...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const snapshot = courseStore.exportCourses(selectedIds.value)
    const result = await courseStore.bulkDelete(selectedIds.value, {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    const deletedCount = result.deletedIds.length
    selectedIds.value = []
    toastStore.push({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Delete Partially Completed' : 'Bulk Delete',
      message: `${deletedCount}/${result.total} course dihapus.`,
      actionLabel: 'Undo',
      onAction: async () => {
        await courseStore.importCourses(snapshot)
        toastStore.push({
          type: 'info',
          title: 'Bulk Restored',
          message: `${deletedCount} course berhasil dikembalikan.`,
        })
      },
    })
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const runBulkAutoPrerequisite = async () => {
  if (!canEditCourse.value || !selectedIds.value.length) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  operationState.value = {
    active: true,
    title: 'Bulk Auto Prerequisite',
    message: `Generating prerequisite path for ${count} course...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const result = await courseStore.bulkAutoSuggestPrerequisites(selectedIds.value, {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    toastStore.push({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Auto Prerequisite Partially Completed' : 'Bulk Auto Prerequisite Completed',
      message: `${result.processed}/${result.total} course berhasil diproses.`,
    })
  } finally {
    operationState.value.active = false
    isBulkBusy.value = false
  }
}

const runBulkClearPrerequisite = async () => {
  if (!canEditCourse.value || !selectedIds.value.length) return
  isBulkBusy.value = true
  const count = selectedIds.value.length
  operationState.value = {
    active: true,
    title: 'Bulk Clear Prerequisite',
    message: `Removing prerequisites from ${count} course...`,
    processed: 0,
    total: count,
    cancelRequested: false,
  }
  try {
    const result = await courseStore.bulkSetPrerequisites(selectedIds.value, [], 'replace', {
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    toastStore.push({
      type: result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Bulk Clear Prerequisite Partially Completed' : 'Bulk Clear Prerequisite Completed',
      message: `${result.processed}/${result.total} course berhasil diproses.`,
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
  const exported = courseStore.exportCourses(selectedIds.value)
  downloadJson(`courses-selected-${new Date().toISOString().slice(0, 10)}.json`, exported)
}

const exportAllJson = () => {
  const exported = courseStore.exportCourses()
  downloadJson(`courses-all-${new Date().toISOString().slice(0, 10)}.json`, exported)
}

const triggerImport = () => {
  if (!canEditCourse.value) return
  importInputRef.value?.click()
}

const handleImportFile = async (event) => {
  const file = event.target?.files?.[0]
  if (!file) return
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
      shouldContinue: () => !operationState.value.cancelRequested,
      onProgress: ({ processed, total }) => {
        operationState.value.processed = processed
        operationState.value.total = total
      },
    })
    importReport.value = result
    toastStore.push({
      type: result.errorCount > 0 || result.cancelled ? 'info' : 'success',
      title: result.cancelled ? 'Import Stopped' : 'Import Complete',
      message: `${result.importedCount}/${result.total} processed (${result.createdCount} created, ${result.updatedCount} updated, ${result.errorCount} error).`,
    })
  } catch (error) {
    toastStore.push({
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

const requestCancelOperation = () => {
  operationState.value.cancelRequested = true
}

const addAsset = () => {
  if (!canEditCourse.value) return
  if (!assetDraft.value.name.trim() || !assetDraft.value.url.trim()) {
    toastStore.push({
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
      const saved = await courseStore.saveDraftEditor()
      lastSavedHash.value = JSON.stringify(saved || {})
      autosaveErrorShown.value = false
    } catch (error) {
      if (!autosaveErrorShown.value) {
        autosaveErrorShown.value = true
        toastStore.push({
          type: 'error',
          title: 'Autosave gagal',
          message: error?.message || 'Silakan simpan manual.',
        })
      }
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
  } catch {
    // ignore
  }
  await Promise.all([courseStore.load(), profileStore.load()])
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  if (autosaveTimerId.value) {
    window.clearTimeout(autosaveTimerId.value)
  }
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
