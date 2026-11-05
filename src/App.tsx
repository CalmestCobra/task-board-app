import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

type TaskStatus = 'todo' | 'in progress' | 'in review' | 'done'
type TaskPriority = 'low' | 'normal' | 'high'

interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  labels: string[] | null
  created_at: string
}

const AVAILABLE_LABELS = ['Bug', 'Feature', 'Design', 'Refactor', 'Urgent']

export default function App() {
  const [loadingSession, setLoadingSession] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [activeDropColumn, setActiveDropColumn] = useState<TaskStatus | null>(null)

  // Filtering & Search States
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterLabel, setFilterLabel] = useState<string>('all')

  // Form States
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [dueDate, setDueDate] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          console.error('Error signing in anonymously:', error.message)
        } else if (data.user) {
          setUserId(data.user.id)
        }
      } else {
        setUserId(session.user.id)
      }

      await fetchTasks()
      setLoadingSession(false)
    }

    initSession()
  }, [])

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching tasks:', error.message)
    } else if (data) {
      setTasks(data as Task[])
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    const newTask = {
      title,
      description: description.trim() || null,
      priority,
      status,
      due_date: dueDate || null,
      labels: selectedLabels,
      user_id: userId,
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert([newTask])
      .select()

    if (error) {
      console.error('Error creating task:', error.message)
    } else if (data) {
      setTasks((prev) => [data[0] as Task, ...prev])
      resetForm()
      setIsModalOpen(false)
    }
  }

  async function handleUpdateStatus(taskId: string, newStatus: TaskStatus) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    )

    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId)

    if (error) {
      console.error('Error updating status:', error.message)
      await fetchTasks()
    }
  }

  async function handleDeleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))

    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) {
      console.error('Error deleting task:', error.message)
      await fetchTasks()
    }
  }

  // Drag and Drop Handlers
  function handleDragStart(e: React.DragEvent, taskId: string) {
    setDraggedTaskId(taskId)
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, colValue: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (activeDropColumn !== colValue) {
      setActiveDropColumn(colValue)
    }
  }

  function handleDragLeave(colValue: TaskStatus) {
    if (activeDropColumn === colValue) {
      setActiveDropColumn(null)
    }
  }

  async function handleDrop(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault()
    setActiveDropColumn(null)

    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
    if (!taskId) return

    const taskToMove = tasks.find((t) => t.id === taskId)
    if (taskToMove && taskToMove.status !== targetStatus) {
      await handleUpdateStatus(taskId, targetStatus)
    }

    setDraggedTaskId(null)
  }

  function toggleFormLabel(label: string) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  function resetForm() {
    setTitle('')
    setDescription('')
    setPriority('normal')
    setStatus('todo')
    setDueDate('')
    setSelectedLabels([])
  }

  // Stats Calculations
  const totalTasksCount = tasks.length
  const completedCount = tasks.filter((t) => t.status === 'done').length
  const todayStr = new Date().toISOString().split('T')[0]
  const overdueCount = tasks.filter(
    (t) => t.due_date && t.due_date < todayStr && t.status !== 'done'
  ).length

  // Filtered Tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority
    const matchesLabel = filterLabel === 'all' || (task.labels && task.labels.includes(filterLabel))

    return matchesSearch && matchesPriority && matchesLabel
  })

  const columns: { label: string; value: TaskStatus; color: string }[] = [
    { label: 'To Do', value: 'todo', color: 'border-slate-500' },
    { label: 'In Progress', value: 'in progress', color: 'border-indigo-500' },
    { label: 'In Review', value: 'in review', color: 'border-amber-500' },
    { label: 'Done', value: 'done', color: 'border-emerald-500' },
  ]

  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'high':
        return 'bg-red-500/10 text-red-400 border-red-500/20'
      case 'normal':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  }

  const getDueDateBadge = (dueDateStr: string | null, status: TaskStatus) => {
    if (!dueDateStr) return null
    if (status === 'done') {
      return <span className="text-slate-500 text-[11px]">Due: {dueDateStr}</span>
    }

    const isOverdue = dueDateStr < todayStr
    const isToday = dueDateStr === todayStr

    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/30">
          ⚠️ Overdue ({dueDateStr})
        </span>
      )
    } else if (isToday) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
          🔥 Due Today
        </span>
      )
    }
    return <span className="text-slate-400 text-[11px]">Due: {dueDateStr}</span>
  }

  if (loadingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <p className="text-sm font-medium">Initializing guest session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans select-none">
      {/* Header */}
      <header className="mx-auto max-w-7xl mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Kanban Workspace</h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Live DB
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Connected as Guest <span className="font-mono text-xs text-indigo-400">({userId?.slice(0, 8)}...)</span>
          </p>
        </div>

        {/* Board Stats Summary */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 shadow-lg">
          <div className="text-center px-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Total</p>
            <p className="text-lg font-extrabold text-white">{totalTasksCount}</p>
          </div>
          <div className="h-8 w-px bg-slate-800"></div>
          <div className="text-center px-2">
            <p className="text-[10px] font-bold text-emerald-400 uppercase">Done</p>
            <p className="text-lg font-extrabold text-emerald-400">{completedCount}</p>
          </div>
          <div className="h-8 w-px bg-slate-800"></div>
          <div className="text-center px-2">
            <p className="text-[10px] font-bold text-red-400 uppercase">Overdue</p>
            <p className="text-lg font-extrabold text-red-400">{overdueCount}</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition duration-150 active:scale-95 cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </header>

      {/* Search & Filtering Toolbar */}
      <div className="mx-auto max-w-7xl mb-8 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <svg className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title or description..."
            className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low Priority</option>
            <option value="normal">Normal Priority</option>
            <option value="high">High Priority</option>
          </select>

          <select
            value={filterLabel}
            onChange={(e) => setFilterLabel(e.target.value)}
            className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Labels</option>
            {AVAILABLE_LABELS.map((lbl) => (
              <option key={lbl} value={lbl}>{lbl}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Board Columns */}
      <main className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.value)
          const isDropActive = activeDropColumn === col.value

          return (
            <div
              key={col.value}
              onDragOver={(e) => handleDragOver(e, col.value)}
              onDragLeave={() => handleDragLeave(col.value)}
              onDrop={(e) => handleDrop(e, col.value)}
              className={`flex flex-col rounded-2xl bg-slate-900/80 border-t-4 ${col.color} border-x border-b ${
                isDropActive ? 'border-indigo-500 bg-slate-900/90 ring-2 ring-indigo-500/50' : 'border-slate-800'
              } p-4 shadow-xl backdrop-blur-sm transition-all duration-150`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="font-bold text-slate-200 tracking-wide text-sm">{col.label}</h2>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400 border border-slate-700">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards Container */}
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[65vh] pr-1 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed ${isDropActive ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 text-slate-600'} p-6 text-center transition-colors`}>
                    <p className="text-xs">No tasks found</p>
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className={`group relative rounded-xl border border-slate-800 bg-slate-800/60 p-4 shadow-md hover:border-slate-700 hover:bg-slate-800 transition duration-200 cursor-grab active:cursor-grabbing ${
                        draggedTaskId === task.id ? 'opacity-40 scale-95' : 'opacity-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                          </svg>
                          <h3 className="font-semibold text-slate-100 text-sm leading-snug">{task.title}</h3>
                        </div>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition cursor-pointer"
                          title="Delete Task"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {task.description && (
                        <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed pl-6">
                          {task.description}
                        </p>
                      )}

                      {/* Labels Display */}
                      {task.labels && task.labels.length > 0 && (
                        <div className="mt-3 pl-6 flex flex-wrap gap-1.5">
                          {task.labels.map((lbl) => (
                            <span key={lbl} className="rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold">
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Due Date Indicator */}
                      {task.due_date && (
                        <div className="mt-3 pl-6 flex items-center gap-1.5 text-[11px]">
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {getDueDateBadge(task.due_date, task.status)}
                        </div>
                      )}

                      <div className="mt-4 pl-6 flex items-center justify-between border-t border-slate-700/50 pt-3">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getPriorityBadge(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>

                        <select
                          value={task.status}
                          onChange={(e) => handleUpdateStatus(task.id, e.target.value as TaskStatus)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="todo">To Do</option>
                          <option value="in progress">In Progress</option>
                          <option value="in review">In Review</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </main>

      {/* New Task Modal with Labels */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Create New Task</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title..."
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Task details..."
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Initial Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="todo">To Do</option>
                    <option value="in progress">In Progress</option>
                    <option value="in review">In Review</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Labels Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Labels / Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_LABELS.map((lbl) => {
                    const isSelected = selectedLabels.includes(lbl)
                    return (
                      <button
                        type="button"
                        key={lbl}
                        onClick={() => toggleFormLabel(lbl)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {lbl}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-indigo-500 transition cursor-pointer"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}