import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Head from 'next/head'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [editingMealDay, setEditingMealDay] = useState(null)
  const [nurseryDays, setNurseryDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [editingShoppingItem, setEditingShoppingItem] = useState(null)
  const [newShoppingItem, setNewShoppingItem] = useState('')
  const [dayMultipliers, setDayMultipliers] = useState({})

  const categorizeIngredients = (ingredients) => {
    // Safety check - ensure ingredients is an array
    if (!Array.isArray(ingredients)) {
      console.error('categorizeIngredients received non-array:', ingredients)
      return []
    }
    
    const categories = {
      produce: ['onion', 'garlic', 'tomato', 'pepper', 'bell pepper', 'carrot', 'potato', 'lettuce', 'cucumber', 'spinach', 'broccoli', 'mushroom', 'courgette', 'aubergine', 'celery', 'leek'],
      meat: ['beef', 'chicken', 'pork', 'lamb', 'turkey', 'sausage', 'bacon', 'mince', 'steak', 'chop'],
      seafood: ['fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'cod', 'haddock', 'mackerel'],
      dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'parmesan', 'mozzarella', 'cheddar', 'feta'],
      grains: ['pasta', 'rice', 'bread', 'flour', 'gnocchi', 'noodles', 'quinoa', 'couscous'],
      pantry: ['oil', 'salt', 'pepper', 'sugar', 'vinegar', 'sauce', 'seasoning', 'pesto', 'stock', 'spice', 'honey', 'cumin', 'paprika'],
      canned: ['beans', 'tomatoes', 'tuna', 'chickpeas', 'corn', 'chopped tomatoes']
    }

    const categorized = { produce: [], meat: [], seafood: [], dairy: [], grains: [], canned: [], pantry: [], other: [] }

    ingredients.forEach(ingredient => {
      const lower = ingredient.toLowerCase()
      let found = false
      
      for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => lower.includes(keyword))) {
          categorized[category].push(ingredient)
          found = true
          break
        }
      }
      
      if (!found) categorized.other.push(ingredient)
    })

    // Return flat array in category order (no titles, just grouped)
    return [
      ...categorized.produce,
      ...categorized.meat,
      ...categorized.seafood,
      ...categorized.dairy,
      ...categorized.grains,
      ...categorized.canned,
      ...categorized.pantry,
      ...categorized.other
    ].filter(Boolean)
  }

  useEffect(() => {
    loadRecipes()
    setStartDate(new Date().toISOString().split('T')[0])
  }, [])

  const loadRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: true })
      
      if (error) throw error
      
      // Group recipes by type
      const grouped = { adult: [], babyRecipe: [], babySnack: [] }
      data?.forEach(recipe => {
        if (grouped[recipe.type]) {
          grouped[recipe.type].push(recipe)
        }
      })
      
      setRecipes(grouped)
    } catch (error) {
      console.error('Error loading recipes:', error)
    }
  }

  const addRecipe = async () => {
    if (!recipeName) {
      alert('Please enter a recipe name')
      return
    }

    if (!recipeLink && !manualIngredients) {
      alert('Please provide either a recipe link or manual ingredients')
      return
    }

    const ingredientList = manualIngredients.split('\n').map(i => i.trim()).filter(i => i.length > 0)

    console.log('🔵 Adding recipe:', {
      name: recipeName,
      type: recipeType,
      link: recipeLink || null,
      multiplier: servingMultiplier,
      ingredients: ingredientList.length > 0 ? ingredientList : null
    })

    try {
      const { data, error } = await supabase
        .from('recipes')
        .insert([{
          name: recipeName,
          type: recipeType,
          link: recipeLink || null,
          multiplier: servingMultiplier,
          ingredients: ingredientList.length > 0 ? ingredientList : null
        }])
        .select()
      
      console.log('🔵 Insert result:', { data, error })
      
      if (error) {
        console.error('🔴 Error adding recipe:', error)
        throw error
      }
      
      await loadRecipes()
      
      setRecipeName('')
      setRecipeLink('')
      setManualIngredients('')
      setServingMultiplier(1)
    } catch (error) {
      console.error('Error adding recipe:', error)
      alert('Failed to add recipe')
    }
  }

  const deleteRecipe = async (type, id) => {
    if (confirm('Delete this recipe?')) {
      try {
        const { error } = await supabase
          .from('recipes')
          .delete()
          .eq('id', id)
        
        if (error) throw error
        
        await loadRecipes()
      } catch (error) {
        console.error('Error deleting recipe:', error)
        alert('Failed to delete recipe')
      }
    }
  }

  const startEditRecipe = (type, recipe) => {
    setEditingRecipe({ ...recipe, type })
    setRecipeName(recipe.name)
    setRecipeLink(recipe.link || '')
    setRecipeType(type)
    setServingMultiplier(recipe.multiplier)
    const ingredientsText = recipe.ingredients 
      ? (Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients)
      : ''
    setManualIngredients(ingredientsText)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const updateRecipe = async () => {
    if (!editingRecipe) return
    
    const ingredientList = manualIngredients.trim() ? manualIngredients.split('\n').map(i => i.trim()).filter(Boolean) : null
    
    try {
      const { error } = await supabase
        .from('recipes')
        .update({
          name: recipeName,
          link: recipeLink || null,
          multiplier: servingMultiplier,
          ingredients: ingredientList
        })
        .eq('id', editingRecipe.id)
      
      if (error) throw error
      
      await loadRecipes()
      cancelEdit()
    } catch (error) {
      console.error('Error updating recipe:', error)
      alert('Failed to update recipe')
    }
  }

  const cancelEdit = () => {
    setRecipeName('')
    setRecipeLink('')
    setRecipeType('adult')
    setServingMultiplier(1)
    setManualIngredients('')
    setEditingRecipe(null)
  }

  const removeMealDay = (date) => {
    if (confirm('Remove this day from the meal plan?')) {
      setMealPlan(prev => prev.filter(day => day.date !== date))
    }
  }

  const swapMealRecipe = (date, currentDinner) => {
    const availableRecipes = recipes.adult.filter(r => r.name !== currentDinner)
    if (availableRecipes.length === 0) {
      alert('No other recipes available to swap')
      return
    }
    setEditingMealDay(date)
  }

  const updateMealDay = (date, newRecipe) => {
    setMealPlan(prev => prev.map(day => {
      if (day.date === date) {
        return {
          ...day,
          dinner: newRecipe.name,
          dinnerLink: newRecipe.link,
          category: newRecipe.link && newRecipe.link.includes('meat') ? 'meat' : 'carbs'
        }
      }
      return day
    }))
    setEditingMealDay(null)
  }

  const generateMealPlan = async () => {
    if (recipes.adult.length === 0) {
      alert('Please add at least one family recipe first')
      return
    }

    setIsGenerating(true)

    try {
      let awayDays = []
      
      // Always try to check calendar - API will return empty array if no token
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

      const calendarData = await calendarRes.json()
      awayDays = calendarData.awayDays || []

      console.log('🔵 Recipes being sent to API:', recipes)
      console.log('🔵 Sample adult recipe:', recipes.adult[0])

      const planRes = await fetch('/api/generate-meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipes,
          awayDays,
          startDate,
          nurseryDays,
          dayMultipliers
        })
      })

      const { mealPlan, shoppingList } = await planRes.json()
      console.log('🔵 Raw shopping list from API:', shoppingList)
      console.log('🔵 Type:', typeof shoppingList, 'Is array?', Array.isArray(shoppingList))
      
      setMealPlan(mealPlan)
      // Apply smart categorization to shopping list
      const categorized = categorizeIngredients(shoppingList)
      console.log('🔵 After categorization:', categorized)
      setShoppingList(categorized)
    } catch (error) {
      alert('Failed to generate meal plan: ' + error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const copyShoppingList = () => {
    const text = shoppingList.map(item => `☐ ${item}`).join('\n')
    navigator.clipboard.writeText(text)
    alert('Shopping list copied! Paste it into Google Keep.')
  }

  const removeShoppingItem = (index) => {
    setShoppingList(prev => prev.filter((_, i) => i !== index))
  }

  const startEditShoppingItem = (index, item) => {
    setEditingShoppingItem(index)
    setNewShoppingItem(item)
  }

  const updateShoppingItem = (index) => {
    if (!newShoppingItem.trim()) {
      removeShoppingItem(index)
      setEditingShoppingItem(null)
      setNewShoppingItem('')
      return
    }
    setShoppingList(prev => prev.map((item, i) => i === index ? newShoppingItem : item))
    setEditingShoppingItem(null)
    setNewShoppingItem('')
  }

  const addShoppingItem = () => {
    if (!newShoppingItem.trim()) return
    setShoppingList(prev => [...prev, newShoppingItem])
    setNewShoppingItem('')
  }

  return (
    <>
      <Head>
        <title>Family Meal Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '48px 32px', borderRadius: '0 0 24px 24px', boxShadow: '0 10px 40px rgba(102, 126, 234, 0.3)' }}>
            <h1 style={{ fontSize: '40px', marginBottom: '12px', fontWeight: '700', letterSpacing: '-0.5px' }}>🍽️ Family Meal Planner</h1>
            <p style={{ opacity: 0.95, fontSize: '18px', fontWeight: '300' }}>Smart weekly planning with calendar sync & shared recipes</p>
          </div>

          <div style={{ padding: '32px' }}>
            <div style={{ 
              background: session ? 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)' : 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', 
              padding: '20px 24px', 
              borderRadius: '16px', 
              marginBottom: '32px', 
              border: '1px solid rgba(255, 255, 255, 0.5)',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
            }}>
              {status === 'loading' ? (
                <div style={{ color: '#2d3748', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '20px', height: '20px', border: '3px solid #667eea', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <span>Checking calendar connection...</span>
                </div>
              ) : session ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#22543d', fontWeight: '500' }}>
                    <span style={{ fontSize: '20px' }}>✓</span>
                    <span>Calendar connected as <strong>{session.user?.email}</strong></span>
                  </div>
                  <button onClick={() => signOut()} style={{ padding: '10px 20px', background: 'white', border: '2px solid rgba(34, 84, 61, 0.2)', borderRadius: '10px', cursor: 'pointer', fontWeight: '500', color: '#22543d', transition: 'all 0.2s' }}>Disconnect</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#2d3748', fontWeight: '400' }}>
                    <span style={{ fontSize: '20px' }}>📅</span>
                    <span>Optional: Connect Google Calendar to skip "Holiday:" days</span>
                  </div>
                  <button onClick={() => signIn('google')} style={{ padding: '10px 20px', background: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '500', color: '#667eea', boxShadow: '0 2px 8px rgba(102, 126, 234, 0.2)', transition: 'all 0.2s' }}>Connect Calendar</button>
                </div>
              )}
            </div>

            <div style={{ background: 'white', padding: '32px', borderRadius: '20px', marginBottom: '32px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)', border: '1px solid rgba(0, 0, 0, 0.05)' }}>
              <h2 style={{ marginBottom: '24px', fontSize: '24px', fontWeight: '600', color: '#2d3748' }}>✨ Add Recipe</h2>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#4a5568', fontSize: '14px' }}>Recipe Type</label>
                <select value={recipeType} onChange={(e) => setRecipeType(e.target.value)} style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', transition: 'border 0.2s', outline: 'none' }}>
                  <option value="adult">Family Recipe</option>
                  <option value="babyRecipe">Baby-Friendly Recipe</option>
                  <option value="babySnack">Baby Snack</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#4a5568', fontSize: '14px' }}>Recipe Name</label>
                <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="e.g., Spaghetti Bolognese" style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', transition: 'border 0.2s', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#4a5568', fontSize: '14px' }}>Recipe Link</label>
                <input value={recipeLink} onChange={(e) => setRecipeLink(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', transition: 'border 0.2s', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#4a5568', fontSize: '14px' }}>Serving Multiplier</label>
                <select value={servingMultiplier} onChange={(e) => setServingMultiplier(parseFloat(e.target.value))} style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', transition: 'border 0.2s', outline: 'none' }}>
                  <option value="1">Standard (1x)</option>
                  <option value="1.5">1.5x servings</option>
                  <option value="2">Double (2x)</option>
                  <option value="3">Triple (3x)</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#4a5568', fontSize: '14px' }}>Manual Ingredients</label>
                <textarea value={manualIngredients} onChange={(e) => setManualIngredients(e.target.value)} placeholder="One per line..." style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', minHeight: '120px', transition: 'border 0.2s', outline: 'none', fontFamily: 'inherit' }} />
              </div>

              <button onClick={editingRecipe ? updateRecipe : addRecipe} style={{ background: editingRecipe ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '14px 32px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)', transition: 'transform 0.2s' }}>
              {editingRecipe ? '✏️ Update Recipe' : '➕ Add Recipe'}
            </button>
            {editingRecipe && (
              <button onClick={cancelEdit} style={{ background: '#e2e8f0', color: '#2d3748', padding: '14px 32px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', marginLeft: '12px', transition: 'all 0.2s' }}>
                Cancel
              </button>
            )}
            </div>

            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#2d3748', marginBottom: '20px' }}>🍕 Family Recipes <span style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontSize: '14px', padding: '4px 12px', borderRadius: '20px', marginLeft: '12px', fontWeight: '500' }}>{recipes.adult.length}</span></h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {recipes.adult.map(r => (
                  <div key={r.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', position: 'relative', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)', transition: 'transform 0.2s, box-shadow 0.2s' }}>
                    <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEditRecipe('adult', r)} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(240, 147, 251, 0.4)' }}>✏️</button>
                      <button onClick={() => deleteRecipe('adult', r.id)} style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(250, 112, 154, 0.4)' }}>×</button>
                    </div>
                    <h3 style={{ marginBottom: '12px', paddingRight: '70px', fontSize: '18px', fontWeight: '600', color: '#2d3748' }}>{r.name} {r.multiplier !== 1 && <span style={{ background: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', color: '#2d3748', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', marginLeft: '8px', fontWeight: '600' }}>{r.multiplier}x</span>}</h3>
                    {r.link && <a href={r.link} target="_blank" style={{ color: '#667eea', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', textDecoration: 'none', fontWeight: '500' }}>🔗 View recipe</a>}
                    {r.ingredients && <div style={{ fontSize: '13px', color: '#718096', lineHeight: '1.6' }}>{Array.isArray(r.ingredients) ? r.ingredients.join(', ') : r.ingredients}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '16px' }}>Generate Weekly Meal Plan</h2>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Nursery Days (baby has lunch at nursery)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: nurseryDays.includes(day) ? '#e6f7ff' : 'white' }}>
                      <input 
                        type="checkbox" 
                        checked={nurseryDays.includes(day)} 
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNurseryDays([...nurseryDays, day])
                          } else {
                            setNurseryDays(nurseryDays.filter(d => d !== day))
                          }
                        }}
                        style={{ marginRight: '6px' }}
                      />
                      {day.slice(0, 3)}
                    </label>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>On nursery days, baby gets 1 evening meal. On other days, baby gets 2 meals.</p>
              </div>
              {!session && (
                <div style={{ background: '#fff3cd', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#856404' }}>
                  💡 Connect your Google Calendar above to automatically skip days marked as "Holiday:" in your calendar
                </div>
              )}
              <button onClick={generateMealPlan} disabled={isGenerating} style={{ background: '#48bb78', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                {isGenerating ? 'Generating...' : 'Generate Meal Plan & Shopping List'}
              </button>
            </div>

            {mealPlan.length > 0 && (
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
                <h2 style={{ marginBottom: '16px' }}>This Week\'s Meal Plan</h2>
                {mealPlan.map(day => (
                  <div key={day.date} style={{ padding: '16px', borderBottom: '1px solid #e0e0e0', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ color: '#667eea', marginBottom: '8px' }}>{day.day} - {day.date}</h4>
                        {day.away ? (
                          <div style={{ color: '#999', fontStyle: 'italic' }}>Away - No meal planned</div>
                        ) : editingMealDay === day.date ? (
                          <div>
                            <p style={{ marginBottom: '8px', fontSize: '14px', color: '#666' }}>Select a recipe:</p>
                            <select 
                              onChange={(e) => {
                                const recipe = recipes.adult.find(r => r.name === e.target.value)
                                if (recipe) updateMealDay(day.date, recipe)
                              }}
                              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', marginRight: '8px' }}
                            >
                              <option value="">Choose recipe...</option>
                              {recipes.adult.filter(r => r.name !== day.dinner).map(r => (
                                <option key={r.id} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                            <button onClick={() => setEditingMealDay(null)} style={{ padding: '6px 12px', background: '#cbd5e0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : (
                          <div>
                            <div style={{ marginBottom: '4px' }}>
                              🍽️ Dinner: {day.dinnerLink ? <a href={day.dinnerLink} target="_blank" style={{ color: '#667eea' }}>{day.dinner}</a> : day.dinner}
                              {day.category && <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#feebc8', color: '#7c2d12' }}>{day.category}</span>}
                              <select 
                                value={dayMultipliers[day.date] || 1} 
                                onChange={(e) => setDayMultipliers({...dayMultipliers, [day.date]: parseFloat(e.target.value)})}
                                style={{ marginLeft: '8px', padding: '4px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px' }}
                              >
                                <option value="1">1x</option>
                                <option value="1.5">1.5x</option>
                                <option value="2">2x</option>
                                <option value="3">3x</option>
                              </select>
                            </div>
                            {day.babySnacks && <div style={{ fontSize: '14px' }}>👶 Baby: {day.babySnacks.join(', ')}</div>}
                          </div>
                        )}
                      </div>
                      {!day.away && editingMealDay !== day.date && (
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                          <button onClick={() => swapMealRecipe(day.date, day.dinner)} style={{ background: '#ed8936', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Swap</button>
                          <button onClick={() => removeMealDay(day.date)} style={{ background: '#f56565', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button 
                  onClick={async () => {
                    try {
                      const planRes = await fetch('/api/generate-meal-plan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          recipes,
                          awayDays: [],
                          startDate,
                          nurseryDays,
                          dayMultipliers,
                          existingMealPlan: mealPlan
                        })
                      })
                      const { shoppingList } = await planRes.json()
                      setShoppingList(categorizeIngredients(shoppingList))
                      alert('Shopping list updated!')
                    } catch (error) {
                      alert('Failed to update shopping list')
                    }
                  }}
                  style={{ marginTop: '16px', background: '#48bb78', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', width: '100%' }}
                >
                  🔄 Update Shopping List with Multipliers
                </button>
              </div>
            )}

            {shoppingList.length > 0 && (
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px' }}>
                <h2 style={{ marginBottom: '16px' }}>Shopping List</h2>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {shoppingList.map((item, i) => (
                    <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {editingShoppingItem === i ? (
                        <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            value={newShoppingItem} 
                            onChange={(e) => setNewShoppingItem(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && updateShoppingItem(i)}
                            style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            autoFocus
                          />
                          <button onClick={() => updateShoppingItem(i)} style={{ padding: '6px 12px', background: '#48bb78', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                          <button onClick={() => { setEditingShoppingItem(null); setNewShoppingItem('') }} style={{ padding: '6px 12px', background: '#cbd5e0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span>{item}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => startEditShoppingItem(i, item)} style={{ background: '#ed8936', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✏️ Edit</button>
                            <button onClick={() => removeShoppingItem(i)} style={{ background: '#f56565', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>× Remove</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                
                <div style={{ marginTop: '16px', padding: '16px', background: '#f7fafc', borderRadius: '8px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>Add Item</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      value={newShoppingItem} 
                      onChange={(e) => setNewShoppingItem(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addShoppingItem()}
                      placeholder="e.g., Milk 1L"
                      style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    <button onClick={addShoppingItem} style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>Add</button>
                  </div>
                </div>

                <button onClick={copyShoppingList} style={{ marginTop: '16px', background: '#48bb78', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', width: '100%' }}>
                  📋 Copy to Clipboard (Google Keep format)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
