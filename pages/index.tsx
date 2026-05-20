import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Head from 'next/head'

export default function Home() {
  const { data: session, status } = useSession()
  const [recipes, setRecipes] = useState({ adult: [], babyRecipe: [], babySnack: [] })
  const [recipeName, setRecipeName] = useState('')
  const [recipeLink, setRecipeLink] = useState('')
  const [recipeType, setRecipeType] = useState('adult')
  const [servingMultiplier, setServingMultiplier] = useState(1)
  const [manualIngredients, setManualIngredients] = useState('')
  const [startDate, setStartDate] = useState('')
  const [mealPlan, setMealPlan] = useState([])
  const [shoppingList, setShoppingList] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('mealPlannerRecipes')
    if (saved) {
      setRecipes(JSON.parse(saved))
    }
    setStartDate(new Date().toISOString().split('T')[0])
  }, [])

  const saveRecipes = (newRecipes) => {
    localStorage.setItem('mealPlannerRecipes', JSON.stringify(newRecipes))
    setRecipes(newRecipes)
  }

  const addRecipe = () => {
    if (!recipeName) {
      alert('Please enter a recipe name')
      return
    }

    if (!recipeLink && !manualIngredients) {
      alert('Please provide either a recipe link or manual ingredients')
      return
    }

    const ingredientList = manualIngredients.split('\n').map(i => i.trim()).filter(i => i.length > 0)

    const newRecipe = {
      id: Date.now(),
      name: recipeName,
      link: recipeLink || null,
      multiplier: servingMultiplier,
      ingredients: ingredientList.length > 0 ? ingredientList : null
    }

    const updatedRecipes = {
      ...recipes,
      [recipeType]: [...recipes[recipeType], newRecipe]
    }

    saveRecipes(updatedRecipes)
    setRecipeName('')
    setRecipeLink('')
    setManualIngredients('')
    setServingMultiplier(1)
  }

  const deleteRecipe = (type, id) => {
    if (confirm('Delete this recipe?')) {
      const updatedRecipes = {
        ...recipes,
        [type]: recipes[type].filter(r => r.id !== id)
      }
      saveRecipes(updatedRecipes)
    }
  }

  const generateMealPlan = async () => {
    if (recipes.adult.length === 0) {
      alert('Please add at least one family recipe first')
      return
    }

    if (!session) {
      alert('Please connect your Google Calendar first')
      return
    }

    setIsGenerating(true)

    try {
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 7)

      const calendarRes = await fetch('/api/check-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate: endDate.toISOString().split('T')[0]
        })
      })

      const { awayDays } = await calendarRes.json()

      const planRes = await fetch('/api/generate-meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipes,
          awayDays,
          startDate
        })
      })

      const { mealPlan, shoppingList } = await planRes.json()
      setMealPlan(mealPlan)
      setShoppingList(shoppingList)
    } catch (error) {
      alert('Failed to generate meal plan: ' + error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const copyShoppingList = () => {
    const text = shoppingList.join('\n')
    navigator.clipboard.writeText(text)
    alert('Shopping list copied! Paste it into Google Keep.')
  }

  return (
    <>
      <Head>
        <title>Family Meal Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '32px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>🍽️ Family Meal Planner</h1>
            <p style={{ opacity: 0.9 }}>Smart weekly meal planning with Google Calendar integration</p>
          </div>

          <div style={{ padding: '32px' }}>
            <div style={{ background: session ? '#c6f6d5' : (status === 'loading' ? '#fef3c7' : '#bee3f8'), padding: '16px', borderRadius: '8px', marginBottom: '24px', color: session ? '#22543d' : (status === 'loading' ? '#78350f' : '#2c5282') }}>
              {status === 'loading' ? (
                <div>Checking connection...</div>
              ) : session ? (
                <div>
                  ✓ Connected to Google Calendar as {session.user?.email}
                  <button onClick={() => signOut()} style={{ marginLeft: '16px', padding: '8px 16px', background: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Disconnect</button>
                </div>
              ) : (
                <div>
                  Ready to connect to Google Calendar
                  <button onClick={() => signIn('google')} style={{ marginLeft: '16px', padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Connect Google Calendar</button>
                </div>
              )}
            </div>

            {/* Rest of the UI - I'll create a simpler version for now */}
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '16px' }}>Add Recipe</h2>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Recipe Type</label>
                <select value={recipeType} onChange={(e) => setRecipeType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                  <option value="adult">Family Recipe</option>
                  <option value="babyRecipe">Baby-Friendly Recipe</option>
                  <option value="babySnack">Baby Snack</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Recipe Name</label>
                <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="e.g., Spaghetti Bolognese" style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Recipe Link</label>
                <input value={recipeLink} onChange={(e) => setRecipeLink(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Serving Multiplier</label>
                <select value={servingMultiplier} onChange={(e) => setServingMultiplier(parseFloat(e.target.value))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                  <option value="1">Standard (1x)</option>
                  <option value="1.5">1.5x servings</option>
                  <option value="2">Double (2x)</option>
                  <option value="3">Triple (3x)</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Manual Ingredients</label>
                <textarea value={manualIngredients} onChange={(e) => setManualIngredients(e.target.value)} placeholder="One per line..." style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', minHeight: '100px' }} />
              </div>

              <button onClick={addRecipe} style={{ background: '#667eea', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Add Recipe</button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h2>Family Recipes ({recipes.adult.length})</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                {recipes.adult.map(r => (
                  <div key={r.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', position: 'relative' }}>
                    <button onClick={() => deleteRecipe('adult', r.id)} style={{ position: 'absolute', top: '12px', right: '12px', background: '#f56565', color: 'white', border: 'none', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer' }}>×</button>
                    <h3 style={{ marginBottom: '8px' }}>{r.name} {r.multiplier !== 1 && <span style={{ background: '#48bb78', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px' }}>{r.multiplier}x</span>}</h3>
                    {r.link && <a href={r.link} target="_blank" style={{ color: '#667eea', fontSize: '13px', display: 'block', marginBottom: '8px' }}>🔗 View recipe</a>}
                    {r.ingredients && <div style={{ fontSize: '13px', color: '#666' }}>{r.ingredients.join(', ')}</div>}
                  </div>
                ))}
              </div>
            </div>

            {session && (
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
                <h2 style={{ marginBottom: '16px' }}>Generate Weekly Meal Plan</h2>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                </div>
                <button onClick={generateMealPlan} disabled={isGenerating} style={{ background: '#48bb78', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                  {isGenerating ? 'Generating...' : 'Generate Meal Plan & Shopping List'}
                </button>
              </div>
            )}

            {mealPlan.length > 0 && (
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
                <h2 style={{ marginBottom: '16px' }}>This Week\'s Meal Plan</h2>
                {mealPlan.map(day => (
                  <div key={day.date} style={{ padding: '16px', borderBottom: '1px solid #e0e0e0' }}>
                    <h4 style={{ color: '#667eea', marginBottom: '8px' }}>{day.day} - {day.date}</h4>
                    {day.away ? (
                      <div style={{ color: '#999', fontStyle: 'italic' }}>Away - No meal planned</div>
                    ) : (
                      <div>
                        <div style={{ marginBottom: '4px' }}>
                          🍽️ Dinner: {day.dinnerLink ? <a href={day.dinnerLink} target="_blank" style={{ color: '#667eea' }}>{day.dinner}</a> : day.dinner}
                          {day.category && <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#feebc8', color: '#7c2d12' }}>{day.category}</span>}
                        </div>
                        {day.babySnacks && <div style={{ fontSize: '14px' }}>👶 Baby: {day.babySnacks.join(', ')}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {shoppingList.length > 0 && (
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px' }}>
                <h2 style={{ marginBottom: '16px' }}>Shopping List</h2>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {shoppingList.map((item, i) => (
                    <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>{item}</li>
                  ))}
                </ul>
                <button onClick={copyShoppingList} style={{ marginTop: '16px', background: '#48bb78', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                  📋 Copy to Clipboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
