// Active tab indicator component to be rendered inside NavLinks
function ActiveTabIndicator() {
  return (
    <div className="absolute bottom-0 left-0 right-0 mx-auto h-0.5 bg-primary w-2/3 rounded-full" 
         style={{ marginBottom: '-2px' }} />
  )
}

export default ActiveTabIndicator;