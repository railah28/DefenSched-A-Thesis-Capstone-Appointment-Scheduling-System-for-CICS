#!/usr/bin/env python3
"""
Script to update faculty-dashboard.html with week selector functionality
"""

import re

# Read the file
with open('DefenSched/public/faculty-dashboard.html', 'r') as f:
    content = f.read()

# 1. Update the card-header to include week selector
old_header = '''        <div class="card-header">
          <span class="card-title">Your Availability</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:12px;color:var(--text3)">Mode:</span>
            <select id="avail-mode" class="form-select" style="width:120px">
              <option value="adviser">Adviser</option>
              <option value="panelist">Panelist</option>
            </select>
            <span id="avail-saving" style="font-size:11px;color:var(--text3);display:none">Saving…</span>
          </div>
        </div>'''

new_header = '''        <div class="card-header">
          <span class="card-title">Your Availability</span>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:12px;color:var(--text3)">Week:</span>
              <select id="avail-week-selector" class="form-select" style="width:250px" onchange="loadAvailability()">
                <option>Loading weeks...</option>
              </select>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:12px;color:var(--text3)">Mode:</span>
              <select id="avail-mode" class="form-select" style="width:120px">
                <option value="adviser">Adviser</option>
                <option value="panelist">Panelist</option>
              </select>
            </div>
            <span id="avail-saving" style="font-size:11px;color:var(--text3);display:none">Saving…</span>
          </div>
        </div>'''

content = content.replace(old_header, new_header)

# 2. Update loadAvailability function to use selected week
old_load_avail = '''    async function loadAvailability() {
      const el = document.getElementById('avail-grid-container');
      const mode = document.getElementById('avail-mode').value;
      el.innerHTML = '<div class="skeleton"></div>';

      try {
        const res = await fetch(`/api/faculty/${_user.id}/availability`);
        if (!res.ok) { el.innerHTML = '<div class="db-empty">Failed to load availability</div>'; return; }
        const { availability } = await res.json();
        _avail = availability || [];

        const start = parseInt((_settings.defense_start_time || '08:00').split(':')[0]);
        const end = parseInt((_settings.defense_end_time || '17:00').split(':')[0]);
        const days = (_settings.defense_days || 'Monday,Tuesday,Wednesday,Thursday,Friday').split(',');

        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const weekDates = days.map((d, i) => {
          const dt = new Date(monday);
          dt.setDate(monday.getDate() + i);
          return dt.toISOString().split('T')[0];
        });'''

new_load_avail = '''    async function loadAvailability() {
      const el = document.getElementById('avail-grid-container');
      const mode = document.getElementById('avail-mode').value;
      const weekSelector = document.getElementById('avail-week-selector');
      
      el.innerHTML = '<div class="skeleton"></div>';

      // If not initialized, populate week selector
      if (weekSelector && weekSelector.options[0].text === 'Loading weeks...') {
        weekSelector.innerHTML = '';
        const today = new Date();
        for (let w = 0; w < 12; w++) {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() + (w * 7) - today.getDay() + 1);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 4);
          const label = `Week of ${startOfWeek.toLocaleDateString('en-PH')} - ${endOfWeek.toLocaleDateString('en-PH')}`;
          const value = startOfWeek.toISOString().split('T')[0];
          weekSelector.appendChild(new Option(label, value));
        }
      }

      try {
        const res = await fetch(`/api/faculty/${_user.id}/availability`);
        if (!res.ok) { el.innerHTML = '<div class="db-empty">Failed to load availability</div>'; return; }
        const { availability } = await res.json();
        _avail = availability || [];

        const start = parseInt((_settings.defense_start_time || '08:00').split(':')[0]);
        const end = parseInt((_settings.defense_end_time || '17:00').split(':')[0]);
        const days = (_settings.defense_days || 'Monday,Tuesday,Wednesday,Thursday,Friday').split(',');

        // Get selected week or use current week
        const selectedWeekStart = weekSelector?.value || new Date().toISOString().split('T')[0];
        const startDate = new Date(selectedWeekStart + 'T00:00:00');
        const monday = new Date(startDate);
        monday.setDate(startDate.getDate() - startDate.getDay() + 1);
        
        const weekDates = days.map((d, i) => {
          const dt = new Date(monday);
          dt.setDate(monday.getDate() + i);
          return dt.toISOString().split('T')[0];
        });'''

content = content.replace(old_load_avail, new_load_avail)

# 3. Also update mode change handler
old_mode_handler = '''    document.getElementById('avail-mode')?.addEventListener('change', () => {
      document.getElementById('avail-mode').options.length = 2; // Prevent duplicates
      loadAvailability();
    });'''

new_mode_handler = '''    document.getElementById('avail-mode')?.addEventListener('change', () => {
      loadAvailability();
    });'''

content = content.replace(old_mode_handler, new_mode_handler)

# Write the updated file
with open('DefenSched/public/faculty-dashboard.html', 'w') as f:
    f.write(content)

print("✅ Faculty dashboard updated with week selector functionality")
